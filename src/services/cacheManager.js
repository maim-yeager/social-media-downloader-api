const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const { run, get, all } = require('../utils/db');
const {
  CACHE_PATH, CACHE_TTL_HOURS, MAX_CACHE_SIZE_MB, MAX_MEMORY_CACHE_MB
} = require('../config/constants');
const { getDirSize, countFiles, formatBytes } = require('../utils/helpers');
const logger = require('../utils/logger');

// Level 1: Memory cache
const memCache = new NodeCache({
  stdTTL: CACHE_TTL_HOURS * 3600,
  maxKeys: 500,
  useClones: false,
});

function generateKey(url, options = {}) {
  const data = JSON.stringify({ url, ...options });
  return crypto.createHash('md5').update(data).digest('hex');
}

// Get from cache
function getCached(key, type = 'metadata') {
  // Check memory first
  const memVal = memCache.get(key);
  if (memVal !== undefined) return memVal;

  // Check disk
  const diskPath = getDiskPath(key, type);
  if (fs.existsSync(diskPath)) {
    try {
      const stat = fs.statSync(diskPath);
      const ttl = getTTL(type);
      if (Date.now() - stat.mtimeMs < ttl) {
        const content = fs.readFileSync(diskPath, 'utf8');
        const data = JSON.parse(content);
        // Promote to memory
        memCache.set(key, data, ttl / 1000);
        // Update DB access time
        run('UPDATE cache_meta SET last_accessed = CURRENT_TIMESTAMP, hits = hits + 1 WHERE key = ?', [key]);
        return data;
      }
    } catch {}
  }
  return null;
}

// Set in cache
function setCache(key, data, type = 'metadata', url = '') {
  // Memory cache
  const ttlSeconds = getTTL(type) / 1000;
  memCache.set(key, data, ttlSeconds);

  // Disk cache for metadata and formats
  if (['metadata', 'formats'].includes(type)) {
    const diskPath = getDiskPath(key, type);
    try {
      fs.mkdirSync(path.dirname(diskPath), { recursive: true });
      fs.writeFileSync(diskPath, JSON.stringify(data), 'utf8');
      
      const expiresAt = new Date(Date.now() + getTTL(type)).toISOString();
      run(`
        INSERT OR REPLACE INTO cache_meta (key, url, type, file_path, filesize, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [key, url, type, diskPath, JSON.stringify(data).length, expiresAt]);
    } catch (e) {
      logger.debug('Failed to write disk cache:', e.message);
    }
  }
}

function getDiskPath(key, type) {
  const dirs = {
    metadata: path.join(CACHE_PATH, 'metadata', `${key}.json`),
    formats: path.join(CACHE_PATH, 'formats', `${key}.json`),
    thumbnails: path.join(CACHE_PATH, 'thumbnails', `${key}.jpg`),
    previews: path.join(CACHE_PATH, 'previews', `${key}_preview.mp4`),
  };
  return dirs[type] || path.join(CACHE_PATH, type, key);
}

function getTTL(type) {
  const ttls = {
    metadata: CACHE_TTL_HOURS * 3600 * 1000,
    formats: CACHE_TTL_HOURS * 3600 * 1000,
    thumbnails: 7 * 24 * 3600 * 1000,
    previews: 3600 * 1000,
  };
  return ttls[type] || CACHE_TTL_HOURS * 3600 * 1000;
}

function deleteCache(key) {
  memCache.del(key);
  const entry = get('SELECT file_path FROM cache_meta WHERE key = ?', [key]);
  if (entry?.file_path) {
    try { fs.unlinkSync(entry.file_path); } catch {}
  }
  run('DELETE FROM cache_meta WHERE key = ?', [key]);
}

async function cleanupExpired() {
  // Clean expired from DB
  const expired = all('SELECT * FROM cache_meta WHERE expires_at < CURRENT_TIMESTAMP');
  let cleaned = 0;
  for (const entry of expired) {
    try { if (entry.file_path) fs.unlinkSync(entry.file_path); } catch {}
    run('DELETE FROM cache_meta WHERE key = ?', [entry.key]);
    cleaned++;
  }

  // LRU eviction if over size limit
  const cacheSize = await getDirSize(CACHE_PATH);
  const maxBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;
  if (cacheSize > maxBytes) {
    const lruEntries = all('SELECT * FROM cache_meta ORDER BY last_accessed ASC LIMIT 100');
    for (const entry of lruEntries) {
      if (await getDirSize(CACHE_PATH) <= maxBytes * 0.8) break;
      try { if (entry.file_path) fs.unlinkSync(entry.file_path); } catch {}
      run('DELETE FROM cache_meta WHERE key = ?', [entry.key]);
      cleaned++;
    }
  }

  if (cleaned > 0) logger.info(`Cache cleanup: removed ${cleaned} entries`);
  return cleaned;
}

async function getStats() {
  const size = await getDirSize(CACHE_PATH);
  const files = await countFiles(CACHE_PATH);
  const totalHits = get('SELECT SUM(hits) as h FROM cache_meta')?.h || 0;
  const total = get('SELECT COUNT(*) as c FROM cache_meta')?.c || 0;
  return {
    size_bytes: size,
    size: formatBytes(size),
    files,
    total_entries: total,
    total_hits: totalHits,
    hit_rate: total > 0 ? (totalHits / (totalHits + total)).toFixed(2) : 0,
  };
}

module.exports = { generateKey, getCached, setCache, deleteCache, cleanupExpired, getStats };
