const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { run, get, all } = require('../utils/db');
const { downloadMedia } = require('./downloader');
const { formatBytes } = require('../utils/helpers');
const { TEMP_PATH, MAX_CONCURRENT_DOWNLOADS } = require('../config/constants');
const logger = require('../utils/logger');

// In-memory progress map: survives process restarts via DB fallback
const progressMap = new Map();

class DownloadManager {
  constructor() {
    this.queue = [];
    this.active = 0;
    this.maxConcurrent = MAX_CONCURRENT_DOWNLOADS || 5;
  }

  createDownload(params) {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    try {
      run(`
        INSERT INTO downloads (id, url, platform, media_type, format_id, quality, status, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, CURRENT_TIMESTAMP)
      `, [id, params.url, params.platform, params.mediaType, params.formatId || null, params.quality || null, expiresAt]);
    } catch (dbErr) {
      logger.error(`DB insert failed for download ${id}: ${dbErr.message}`);
    }

    progressMap.set(id, {
      id,
      url: params.url,
      status: 'queued',
      progress: 0,
      downloaded: 0,
      total: 0,
      speed: 0,
      eta: 0,
      created_at: new Date().toISOString(),
    });

    this.enqueue({ id, ...params });
    return id;
  }

  enqueue(job) {
    this.queue.push(job);
    // Defer so current call stack can return the id first
    setImmediate(() => this.processQueue());
  }

  processQueue() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;

    const job = this.queue.shift();
    this.active++;

    this.executeDownload(job)
      .catch(err => logger.error(`Download ${job.id} unhandled error: ${err.message}`))
      .finally(() => {
        this.active--;
        this.processQueue();
      });
  }

  async executeDownload(job) {
    const { id, url, formatId, quality, type, ext, subtitles, embedMetadata } = job;

    this.updateProgress(id, { status: 'downloading', started_at: new Date().toISOString() });

    try {
      run(`UPDATE downloads SET status = 'downloading', started_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    } catch {}

    try {
      const result = await downloadMedia(url, {
        formatId,
        quality,
        type,
        ext,
        downloadId: id,
        subtitles,
        embedMetadata,
        onProgress: (progress) => {
          this.updateProgress(id, {
            status: 'downloading',
            progress: progress.percent,
            downloaded: progress.downloaded,
            total: progress.total,
            speed: progress.speed,
            eta: progress.eta,
          });
          this.broadcastProgress(id);
        },
      });

      // Verify file really exists
      if (!fs.existsSync(result.filePath)) {
        throw new Error('Output file vanished before completion record');
      }

      const fileSize = fs.statSync(result.filePath).size;
      const filename = path.basename(result.filePath);

      try {
        run(`
          UPDATE downloads SET
            status = 'completed',
            output_path = ?,
            filename = ?,
            filesize = ?,
            progress = 100,
            completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [result.filePath, filename, fileSize, id]);
      } catch {}

      this.updateProgress(id, {
        status: 'completed',
        progress: 100,
        filePath: result.filePath,
        filename,
        filesize: fileSize,
        completed_at: new Date().toISOString(),
      });

      this.incrementStats(job.platform);
      this.broadcastProgress(id);

      if (job.webhookUrl) {
        this.sendWebhook(job.webhookUrl, { id, status: 'completed', filename, filesize: fileSize });
      }

      logger.info(`Download completed: ${id} filename=${filename} size=${formatBytes(fileSize)}`);

    } catch (error) {
      try {
        run(`UPDATE downloads SET status = 'failed', error_message = ? WHERE id = ?`, [error.message, id]);
      } catch {}

      this.updateProgress(id, { status: 'failed', error: error.message });
      this.broadcastProgress(id);

      if (job.webhookUrl) {
        this.sendWebhook(job.webhookUrl, { id, status: 'failed', error: error.message });
      }

      throw error;
    }
  }

  updateProgress(id, data) {
    const existing = progressMap.get(id) || {};
    progressMap.set(id, { ...existing, ...data });
  }

  getProgress(id) {
    const mem = progressMap.get(id);
    if (mem) return mem;

    // Fallback to DB
    try {
      const row = get('SELECT * FROM downloads WHERE id = ?', [id]);
      if (row) {
        return {
          id,
          status: row.status,
          progress: row.progress || 0,
          filePath: row.output_path,
          filename: row.filename,
          filesize: row.filesize,
          error: row.error_message,
          started_at: row.started_at,
          completed_at: row.completed_at,
        };
      }
    } catch {}

    return null;
  }

  broadcastProgress(id) {
    if (!global.wss) return;
    try {
      const progress = progressMap.get(id);
      if (!progress) return;
      const msg = JSON.stringify({ type: 'progress', downloadId: id, ...progress });
      global.wss.clients.forEach(ws => {
        if (ws.readyState !== 1 /* OPEN */) return;
        if (ws.downloadId === id || (ws.subscriptions && ws.subscriptions.includes('all'))) {
          try { ws.send(msg); } catch {}
        }
      });
    } catch {}
  }

  incrementStats(platform) {
    try {
      const stats = get('SELECT platform_counts FROM stats WHERE id = ?', ['global']);
      const counts = JSON.parse(stats?.platform_counts || '{}');
      counts[platform] = (counts[platform] || 0) + 1;
      run(
        `UPDATE stats SET total_downloads = total_downloads + 1, platform_counts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'global'`,
        [JSON.stringify(counts)]
      );
    } catch {}
  }

  async sendWebhook(url, data) {
    try {
      const axios = require('axios');
      await axios.post(url, data, { timeout: 10000 });
    } catch (e) {
      logger.warn(`Webhook failed (${url}): ${e.message}`);
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  getAllActive() {
    return all("SELECT * FROM downloads WHERE status IN ('queued','downloading') ORDER BY created_at ASC");
  }
}

const manager = new DownloadManager();
module.exports = manager;
