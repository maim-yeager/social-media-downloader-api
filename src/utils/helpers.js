const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const {
  COOKIE_PATH, TEMP_PATH, CACHE_PATH, LOG_PATH, BACKUP_PATH, DATA_PATH
} = require('../config/constants');

async function initFolders() {
  const dirs = [
    DATA_PATH,
    COOKIE_PATH,
    TEMP_PATH,
    path.join(TEMP_PATH, 'incomplete'),
    path.join(TEMP_PATH, 'failed'),
    path.join(TEMP_PATH, 'previews'),
    CACHE_PATH,
    path.join(CACHE_PATH, 'metadata'),
    path.join(CACHE_PATH, 'thumbnails'),
    path.join(CACHE_PATH, 'previews'),
    path.join(CACHE_PATH, 'formats'),
    path.join(CACHE_PATH, 'media'),
    LOG_PATH,
    BACKUP_PATH,
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateCacheKey(url, options = {}) {
  const data = { url, ...options };
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200)
    .trim();
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function getDirSize(dirPath) {
  let size = 0;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        size += await getDirSize(full);
      } else {
        try { size += fs.statSync(full).size; } catch {}
      }
    }
  } catch {}
  return size;
}

async function countFiles(dirPath) {
  let count = 0;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        count += await countFiles(path.join(dirPath, item.name));
      } else {
        count++;
      }
    }
  } catch {}
  return count;
}

async function checkCommand(cmd) {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function getCommandVersion(cmd, versionFlag = '--version') {
  try {
    const { stdout } = await execAsync(`${cmd} ${versionFlag} 2>&1`);
    return stdout.trim().split('\n')[0];
  } catch {
    return null;
  }
}

function parseNetscapeCookies(content) {
  const lines = content.split('\n');
  const cookies = [];
  let minExpiry = Infinity;

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const expiry = parseInt(parts[4]);
      if (expiry && expiry < minExpiry) minExpiry = expiry;
      cookies.push({
        domain: parts[0],
        httpOnly: parts[1] === 'TRUE',
        path: parts[2],
        secure: parts[3] === 'TRUE',
        expiry: expiry || null,
        name: parts[5],
        value: parts[6]?.trim(),
      });
    }
  }

  return {
    cookies,
    count: cookies.length,
    domains: [...new Set(cookies.map(c => c.domain))],
    expiresAt: minExpiry !== Infinity ? new Date(minExpiry * 1000).toISOString() : null,
    expiredCount: cookies.filter(c => c.expiry && c.expiry < Date.now() / 1000).length,
  };
}

function getRandomUserAgent() {
  const { USER_AGENTS } = require('../config/platforms');
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

module.exports = {
  initFolders,
  generateCacheKey,
  formatBytes,
  formatDuration,
  formatUptime,
  sanitizeFilename,
  isValidUrl,
  getFileSize,
  getDirSize,
  countFiles,
  checkCommand,
  getCommandVersion,
  parseNetscapeCookies,
  getRandomUserAgent,
};
