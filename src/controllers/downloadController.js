const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const downloadManager = require('../services/downloadManager');
const { extractInfo } = require('../services/downloader');
const { detectPlatform, detectMediaType } = require('../services/platformDetector');
const { generateKey, getCached } = require('../services/cacheManager');
const { APIError } = require('../middleware/errorHandler');
const { ERROR_CODES, TEMP_PATH } = require('../config/constants');
const { formatBytes, sanitizeFilename } = require('../utils/helpers');
const logger = require('../utils/logger');

async function startDownload(req, res, next) {
  const {
    url,
    format_id,
    quality,
    type = 'auto',
    ext,
    subtitles,
    embed_metadata = true,
    embed_thumbnail = false,
    webhook_url,
  } = req.body;

  try {
    const platform = detectPlatform(url);
    if (!platform) {
      return next(new APIError('Unsupported platform or unrecognized URL', ERROR_CODES.UNSUPPORTED_PLATFORM, 400));
    }

    // Auto-detect media type
    let mediaType = type;
    if (type === 'auto') {
      try {
        const { info } = await extractInfo(url, { noCookies: false });
        mediaType = detectMediaType(info);
      } catch (e) {
        logger.warn(`Auto-detect failed, defaulting to video: ${e.message}`);
        mediaType = 'video';
      }
    }

    // Determine output extension
    let outputExt = ext;
    if (!outputExt) {
      if (mediaType === 'audio') outputExt = 'mp3';
      else if (mediaType === 'photo') outputExt = 'jpg';
      else outputExt = 'mp4';
    }

    const jobId = downloadManager.createDownload({
      url,
      platform,
      mediaType,
      formatId: format_id,
      quality,
      type: mediaType,
      ext: outputExt,
      subtitles,
      embedMetadata: embed_metadata,
      embedThumbnail: embed_thumbnail,
      webhookUrl: webhook_url,
    });

    const queueStats = downloadManager.getStats();
    const isQueued = queueStats.active >= parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || 5);

    logger.info(`Download queued: ${jobId} [${platform}] type=${mediaType} ext=${outputExt}`);

    return res.status(202).json({
      success: true,
      download_id: jobId,
      status: isQueued ? 'queued' : 'downloading',
      position: isQueued ? downloadManager.queue.length : undefined,
      estimated_wait: isQueued ? downloadManager.queue.length * 30 : undefined,
      progress_url: `/api/download/${jobId}/progress`,
      platform,
      media_type: mediaType,
    });

  } catch (error) {
    logger.error(`Download start failed: ${error.message}`);
    next(new APIError(error.message, ERROR_CODES.DOWNLOAD_FAILED, 500));
  }
}

async function getProgress(req, res, next) {
  const { id } = req.params;
  const progress = downloadManager.getProgress(id);

  if (!progress) {
    return next(new APIError('Download not found', 'NOT_FOUND', 404));
  }

  const response = {
    download_id: id,
    status: progress.status,
    progress: progress.progress || 0,
    downloaded: progress.downloaded || 0,
    downloaded_formatted: formatBytes(progress.downloaded),
    total: progress.total || 0,
    total_formatted: formatBytes(progress.total),
    speed: progress.speed || 0,
    speed_formatted: `${formatBytes(progress.speed) || '0 B'}/s`,
    eta: progress.eta || 0,
    eta_formatted: progress.eta ? `${progress.eta}s` : null,
    started_at: progress.started_at,
    completed_at: progress.completed_at,
    error: progress.error || null,
  };

  if (progress.status === 'completed' && progress.filePath) {
    // Verify file still exists on disk
    if (!fs.existsSync(progress.filePath)) {
      return next(new APIError('File has expired or been cleaned up', 'NOT_FOUND', 404));
    }
    const filename = sanitizeFilename(progress.filename || path.basename(progress.filePath));
    response.download_url = `/api/download/file/${id}/${encodeURIComponent(filename)}`;
    response.filename = filename;
    response.filesize = progress.filesize;
    response.filesize_formatted = formatBytes(progress.filesize);
  }

  res.json(response);
}

async function serveFile(req, res, next) {
  const { id } = req.params;
  const progress = downloadManager.getProgress(id);

  if (!progress || progress.status !== 'completed') {
    return next(new APIError('File not ready or not found', 'NOT_FOUND', 404));
  }

  const filePath = progress.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return next(new APIError('File not found on disk – it may have expired', 'NOT_FOUND', 404));
  }

  const filename = sanitizeFilename(progress.filename || path.basename(filePath));
  const stat = fs.statSync(filePath);
  const mimeType = getMimeType(filePath);

  // Set common headers
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Download-ID', id);

  const range = req.headers.range;
  if (range) {
    // Parse range header
    const rangeMatch = range.replace(/bytes=/, '').split('-');
    const start = parseInt(rangeMatch[0], 10);
    const end = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }

    const chunkSize = end - start + 1;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', chunkSize);
    res.status(206);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', (err) => {
      logger.error(`Stream error serving ${id}: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    res.status(200);

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error(`Stream error serving ${id}: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  }
}

async function listDownloads(req, res, next) {
  const { status, limit = 20, offset = 0 } = req.query;

  try {
    const { all, get: dbGet } = require('../utils/db');

    let sql = 'SELECT * FROM downloads WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const downloads = all(sql, params);
    const countSql = `SELECT COUNT(*) as c FROM downloads${status ? ' WHERE status = ?' : ''}`;
    const total = dbGet(countSql, status ? [status] : [])?.c || 0;

    res.json({
      success: true,
      total,
      downloads: downloads.map(d => ({
        id: d.id,
        url: d.url,
        platform: d.platform,
        status: d.status,
        progress: d.progress,
        filesize: d.filesize,
        filename: d.filename,
        created_at: d.created_at,
        completed_at: d.completed_at,
      })),
    });
  } catch (error) {
    logger.error(`listDownloads error: ${error.message}`);
    next(new APIError('Failed to list downloads', ERROR_CODES.INTERNAL_ERROR, 500));
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.opus': 'audio/opus',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
  };
  return types[ext] || 'application/octet-stream';
}

module.exports = { startDownload, getProgress, serveFile, listDownloads };
