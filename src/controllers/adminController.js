const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { get, all, run } = require('../utils/db');
const { getCookieStats, getCookieList, deleteCookie, bulkDeleteCookies, uploadCookie } = require('../services/cookieManager');
const { getStats: getCacheStats } = require('../services/cacheManager');
const downloadManager = require('../services/downloadManager');
const { formatBytes, formatUptime, getDirSize, checkCommand, getCommandVersion } = require('../utils/helpers');
const { DATA_PATH, BACKUP_PATH, VERSION } = require('../config/constants');
const logger = require('../utils/logger');

async function getHealth(req, res) {
  const isAdmin = req.apiKey?.permissions?.includes('admin');

  const basic = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: VERSION,
    uptime: process.uptime(),
    uptime_formatted: formatUptime(Math.floor(process.uptime())),
  };

  if (!isAdmin) return res.json(basic);

  try {
    const [ytdlpOk, ffmpegOk, ytdlpVer, ffmpegVer] = await Promise.all([
      checkCommand('yt-dlp'),
      checkCommand('ffmpeg'),
      getCommandVersion('yt-dlp'),
      getCommandVersion('ffmpeg', '-version'),
    ]);

    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const cacheStats = await getCacheStats();
    const cookieStats = getCookieStats();
    const dlStats = downloadManager.getStats();

    const dbStats = {
      total_downloads: get('SELECT COUNT(*) as c FROM downloads')?.c || 0,
      completed_today: get("SELECT COUNT(*) as c FROM downloads WHERE status='completed' AND date(created_at)=date('now')")?.c || 0,
    };

    let diskInfo = { total: 'N/A', used: 'N/A', free: 'N/A', usage_percent: 0 };
    try {
      const { stdout } = await execAsync(`df -k ${DATA_PATH} | tail -1`);
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1]) * 1024;
        const used = parseInt(parts[2]) * 1024;
        const free = parseInt(parts[3]) * 1024;
        diskInfo = {
          total: formatBytes(total),
          used: formatBytes(used),
          free: formatBytes(free),
          usage_percent: Math.round((used / total) * 100),
        };
      }
    } catch {}

    res.json({
      ...basic,
      services: {
        database: 'connected',
        'yt-dlp': ytdlpOk ? `available (${ytdlpVer?.split('\n')[0]})` : 'unavailable',
        ffmpeg: ffmpegOk ? `available (${ffmpegVer?.split('\n')[0]})` : 'unavailable',
        disk_space: diskInfo,
        memory: {
          total: formatBytes(totalMem),
          used: formatBytes(usedMem),
          free: formatBytes(freeMem),
          process_rss: formatBytes(memUsage.rss),
          usage_percent: Math.round((usedMem / totalMem) * 100),
        },
        cache: cacheStats,
        downloads: {
          active: dlStats.active,
          queued: dlStats.queued,
          completed_today: dbStats.completed_today,
          total: dbStats.total_downloads,
        },
        cookies: cookieStats,
      },
    });
  } catch (error) {
    res.json({ ...basic, error: error.message });
  }
}

async function getStats(req, res) {
  const isAdmin = req.apiKey?.permissions?.includes('admin');

  const globalStats = get('SELECT * FROM stats WHERE id = ?', ['global']);
  const platformCounts = JSON.parse(globalStats?.platform_counts || '{}');
  const dlStats = downloadManager.getStats();

  const byPlatform = {};
  let total = globalStats?.total_downloads || 0;

  Object.entries(platformCounts).forEach(([platform, count]) => {
    byPlatform[platform] = count;
  });

  const cacheStats = await getCacheStats();
  const cookieStats = getCookieStats();

  const response = {
    total_downloads: total,
    ...Object.fromEntries(
      Object.entries(platformCounts).map(([p, c]) => [`${p}_downloads`, c])
    ),
    total_data_transferred: formatBytes(globalStats?.total_bytes || 0),
    active_downloads: dlStats.active,
    queued_downloads: dlStats.queued,
    cache_hit_rate: cacheStats.hit_rate,
    uptime: formatUptime(Math.floor(process.uptime())),
  };

  if (isAdmin) {
    const recentErrors = all(
      "SELECT error_message, COUNT(*) as c FROM downloads WHERE status='failed' AND created_at > datetime('now','-1 day') GROUP BY error_message ORDER BY c DESC LIMIT 10"
    );

    response.detailed_stats = {
      by_platform: byPlatform,
      recent_errors: recentErrors,
      performance: {
        process_uptime: process.uptime(),
        memory_usage: formatBytes(process.memoryUsage().rss),
      },
    };
    response.cookie_stats = cookieStats;
    response.cache_stats = cacheStats;
  }

  res.json(response);
}

// Cookie management
async function listCookies(req, res) {
  const cookies = getCookieList(req.query);
  const counts = {};
  cookies.forEach(c => { counts[c.platform] = (counts[c.platform] || 0) + 1; });

  const total = get('SELECT COUNT(*) as c FROM cookies')?.c || 0;

  res.json({ success: true, total, platforms: counts, cookies });
}

async function uploadCookieHandler(req, res, next) {
  try {
    const { platform, account_name, priority } = req.body;
    if (!platform || !account_name) {
      return res.status(400).json({ success: false, error: { message: 'platform and account_name required' } });
    }

    let cookieContent;
    if (req.file) {
      cookieContent = req.file.buffer.toString('utf8');
    } else if (req.body.cookies) {
      cookieContent = req.body.cookies;
    } else {
      return res.status(400).json({ success: false, error: { message: 'Cookie file or content required' } });
    }

    const result = await uploadCookie({
      platform,
      account_name,
      priority: parseInt(priority) || 3,
      cookieContent,
    });

    res.json({
      success: true,
      id: result.id,
      platform,
      account_name,
      cookie_analysis: result.analysis,
      message: 'Cookies uploaded and validated successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
}

async function deleteCookieHandler(req, res) {
  const { id } = req.params;
  const deleted = deleteCookie(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: { message: 'Cookie not found' } });
  }
  res.json({ success: true, message: 'Cookie deleted successfully', id, platform: deleted.platform, account_name: deleted.account_name });
}

async function bulkDeleteCookiesHandler(req, res) {
  const count = bulkDeleteCookies(req.body || {});
  res.json({ success: true, deleted_count: count, message: `${count} cookies deleted` });
}

// API Key management
async function createApiKey(req, res) {
  const { name, permissions = ['read'], expires_at, rate_limit = 1000 } = req.body;
  if (!name) return res.status(400).json({ success: false, error: { message: 'name required' } });

  const key = `sk_live_${uuidv4().replace(/-/g, '')}`;
  const id = uuidv4();

  run(`
    INSERT INTO api_keys (id, key_hash, name, permissions, rate_limit, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, key, name, JSON.stringify(permissions), rate_limit, expires_at || null]);

  res.json({
    success: true,
    key,
    name,
    permissions,
    expires_at: expires_at || null,
    created_at: new Date().toISOString(),
  });
}

async function listApiKeys(req, res) {
  const keys = all('SELECT id, name, permissions, rate_limit, is_active, last_used, expires_at, created_at FROM api_keys');
  res.json({ success: true, keys });
}

async function deleteApiKey(req, res) {
  const { id } = req.params;
  const key = get('SELECT id FROM api_keys WHERE id = ?', [id]);
  if (!key) return res.status(404).json({ success: false, error: { message: 'Key not found' } });
  run('DELETE FROM api_keys WHERE id = ?', [id]);
  res.json({ success: true, message: 'API key deleted' });
}

// Backup
async function createBackup(req, res) {
  const { include_database = true, include_cookies = true } = req.body || {};
  const backupId = `backup_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)}`;
  const backupDir = path.join(BACKUP_PATH, backupId);

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const files = [];

    if (include_database) {
      const dbPath = process.env.DB_PATH || path.join(DATA_PATH, 'database.sqlite');
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, path.join(backupDir, 'database.sqlite'));
        files.push('database.sqlite');
      }
    }

    if (include_cookies) {
      const cookieSrc = process.env.COOKIE_PATH || path.join(DATA_PATH, 'cookies');
      if (fs.existsSync(cookieSrc)) {
        await execAsync(`cp -r "${cookieSrc}" "${path.join(backupDir, 'cookies')}"`);
        files.push('cookies/');
      }
    }

    // Create tar.gz
    const tarPath = path.join(BACKUP_PATH, `${backupId}.tar.gz`);
    await execAsync(`tar -czf "${tarPath}" -C "${BACKUP_PATH}" "${backupId}"`);
    fs.rmSync(backupDir, { recursive: true });

    const size = fs.statSync(tarPath).size;

    res.json({
      success: true,
      backup_id: backupId,
      size,
      size_formatted: formatBytes(size),
      files,
      created_at: new Date().toISOString(),
      download_url: `/api/admin/backup/download/${backupId}`,
    });
  } catch (error) {
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

async function downloadBackup(req, res) {
  const { id } = req.params;
  const tarPath = path.join(BACKUP_PATH, `${id}.tar.gz`);
  if (!fs.existsSync(tarPath)) {
    return res.status(404).json({ success: false, error: { message: 'Backup not found' } });
  }
  res.download(tarPath, `${id}.tar.gz`);
}

async function listBackups(req, res) {
  const files = fs.readdirSync(BACKUP_PATH).filter(f => f.endsWith('.tar.gz'));
  const backups = files.map(f => {
    const fpath = path.join(BACKUP_PATH, f);
    const stat = fs.statSync(fpath);
    return {
      id: f.replace('.tar.gz', ''),
      filename: f,
      size: stat.size,
      size_formatted: formatBytes(stat.size),
      created_at: stat.birthtime.toISOString(),
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({ success: true, backups });
}

// Logs
async function getLogs(req, res) {
  const { level = 'info', lines = 100 } = req.query;
  const logFile = path.join(process.env.LOG_PATH || path.join(DATA_PATH, 'logs'), 'combined.log');

  try {
    const { stdout } = await execAsync(`tail -n ${parseInt(lines)} "${logFile}" 2>/dev/null || echo "[]"`);
    const logLines = stdout.trim().split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return { message: l }; } })
      .filter(l => !level || l.level === level || level === 'all');

    res.json({ success: true, lines: logLines.length, logs: logLines });
  } catch (error) {
    res.json({ success: true, logs: [], error: error.message });
  }
}

// Manual yt-dlp update trigger
async function updateYtDlp(req, res) {
  try {
    const { checkAndUpdateYtDlp } = require('../jobs/ytDlpUpdate');
    const result = await checkAndUpdateYtDlp();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Cleanup trigger
async function triggerCleanup(req, res) {
  try {
    const { cleanupTempFiles } = require('../jobs/cleanup');
    const result = await cleanupTempFiles();
    const { cleanupExpired } = require('../services/cacheManager');
    const cacheResult = await cleanupExpired();
    res.json({ success: true, temp_cleaned: result, cache_cleaned: cacheResult });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

module.exports = {
  getHealth,
  getStats,
  listCookies,
  uploadCookieHandler,
  deleteCookieHandler,
  bulkDeleteCookiesHandler,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  createBackup,
  downloadBackup,
  listBackups,
  getLogs,
  updateYtDlp,
  triggerCleanup,
};
