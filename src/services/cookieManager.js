const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../utils/db');
const { parseNetscapeCookies } = require('../utils/helpers');
const { COOKIE_PATH, COOKIE_FAIL_THRESHOLD, COOKIE_ROTATION_STRATEGY } = require('../config/constants');
const logger = require('../utils/logger');

class CookieRotator {
  constructor() {
    this.lastIndex = {};
  }

  roundRobin(cookies, platform) {
    if (this.lastIndex[platform] === undefined) this.lastIndex[platform] = -1;
    this.lastIndex[platform] = (this.lastIndex[platform] + 1) % cookies.length;
    return cookies[this.lastIndex[platform]];
  }

  random(cookies) {
    return cookies[Math.floor(Math.random() * cookies.length)];
  }

  leastUsed(cookies) {
    return [...cookies].sort((a, b) => a.success_count - b.success_count)[0];
  }

  weightedRandom(cookies) {
    const weights = cookies.map(c => {
      const total = c.success_count + c.fail_count;
      return total === 0 ? 1 : (c.success_count / total);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < cookies.length; i++) {
      random -= weights[i];
      if (random <= 0) return cookies[i];
    }
    return cookies[0];
  }

  getCookie(cookies, platform, strategy) {
    if (!cookies || cookies.length === 0) return null;
    switch (strategy || COOKIE_ROTATION_STRATEGY) {
      case 'round-robin': return this.roundRobin(cookies, platform);
      case 'random': return this.random(cookies);
      case 'least-used': return this.leastUsed(cookies);
      case 'weighted': return this.weightedRandom(cookies);
      default: return this.roundRobin(cookies, platform);
    }
  }
}

const rotator = new CookieRotator();

async function uploadCookie({ platform, account_name, priority = 3, cookieContent }) {
  const cookieFile = path.join(COOKIE_PATH, `${platform}_${account_name}.txt`);
  
  // Parse and validate
  const analysis = parseNetscapeCookies(cookieContent);
  if (analysis.count === 0) throw new Error('No valid cookies found in file');

  // Save file
  fs.writeFileSync(cookieFile, cookieContent, 'utf8');

  const id = uuidv4();
  const expiresAt = analysis.expiresAt;

  // Upsert in DB
  run(`
    INSERT INTO cookies (id, platform, account_name, cookie_file_path, priority, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, account_name) DO UPDATE SET
      cookie_file_path = excluded.cookie_file_path,
      priority = excluded.priority,
      expires_at = excluded.expires_at,
      status = 'active',
      fail_count = 0,
      consecutive_failures = 0,
      updated_at = CURRENT_TIMESTAMP
  `, [id, platform, account_name, cookieFile, priority, expiresAt]);

  const cookie = get('SELECT id FROM cookies WHERE platform = ? AND account_name = ?', [platform, account_name]);

  return { id: cookie.id, analysis };
}

function getCookiesForPlatform(platform) {
  return all(`
    SELECT * FROM cookies
    WHERE platform = ? AND status = 'active'
    ORDER BY priority ASC, last_used ASC NULLS FIRST
  `, [platform]);
}

function selectBestCookie(platform) {
  const cookies = getCookiesForPlatform(platform);
  if (!cookies.length) return null;

  // Filter expired
  const valid = cookies.filter(c => {
    if (c.expires_at && new Date(c.expires_at) < new Date()) {
      run(`UPDATE cookies SET status = 'expired' WHERE id = ?`, [c.id]);
      return false;
    }
    if (c.consecutive_failures >= COOKIE_FAIL_THRESHOLD) {
      run(`UPDATE cookies SET status = 'disabled', notes = 'Too many failures' WHERE id = ?`, [c.id]);
      return false;
    }
    return true;
  });

  return rotator.getCookie(valid, platform);
}

function getCookieFilePath(cookieId) {
  const cookie = get('SELECT cookie_file_path FROM cookies WHERE id = ?', [cookieId]);
  return cookie?.cookie_file_path || null;
}

function recordCookieSuccess(cookieId) {
  run(`
    UPDATE cookies SET
      success_count = success_count + 1,
      consecutive_failures = 0,
      last_used = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [cookieId]);
}

function recordCookieFailure(cookieId, reason = '') {
  run(`
    UPDATE cookies SET
      fail_count = fail_count + 1,
      consecutive_failures = consecutive_failures + 1,
      last_used = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [cookieId]);

  // Auto-disable on too many failures
  const cookie = get('SELECT consecutive_failures FROM cookies WHERE id = ?', [cookieId]);
  if (cookie && cookie.consecutive_failures >= COOKIE_FAIL_THRESHOLD) {
    run(`
      UPDATE cookies SET status = 'disabled', notes = ?
      WHERE id = ?
    `, [`Disabled: ${reason || 'Too many failures'}`, cookieId]);
    logger.warn(`Cookie ${cookieId} auto-disabled`);
  }
}

function logCookieUsage(cookieId, downloadId, success, error = null) {
  try {
    const cookie = get('SELECT platform FROM cookies WHERE id = ?', [cookieId]);
    run(`
      INSERT INTO cookie_logs (id, cookie_id, platform, download_id, success, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [uuidv4(), cookieId, cookie?.platform, downloadId, success ? 1 : 0, error?.message || null]);
  } catch (e) {
    logger.debug('Failed to log cookie usage:', e.message);
  }
}

function getCookieList(filters = {}) {
  let sql = 'SELECT * FROM cookies WHERE 1=1';
  const params = [];

  if (filters.platform) {
    sql += ' AND platform = ?';
    params.push(filters.platform);
  }
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }

  sql += ' ORDER BY priority ASC, created_at DESC';
  sql += ` LIMIT ${parseInt(filters.limit) || 50} OFFSET ${parseInt(filters.offset) || 0}`;

  return all(sql, params).map(c => {
    let cookieCount = 0, domains = [];
    try {
      const content = fs.readFileSync(c.cookie_file_path, 'utf8');
      const parsed = parseNetscapeCookies(content);
      cookieCount = parsed.count;
      domains = parsed.domains;
    } catch {}
    return { ...c, cookie_count: cookieCount, domains };
  });
}

function deleteCookie(id) {
  const cookie = get('SELECT * FROM cookies WHERE id = ?', [id]);
  if (!cookie) return false;

  // Delete file
  try { fs.unlinkSync(cookie.cookie_file_path); } catch {}

  run('DELETE FROM cookies WHERE id = ?', [id]);
  return cookie;
}

function bulkDeleteCookies(filters = {}) {
  let sql = 'SELECT * FROM cookies WHERE 1=1';
  const params = [];

  if (filters.platform) { sql += ' AND platform = ?'; params.push(filters.platform); }
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.older_than) { sql += ' AND created_at < ?'; params.push(filters.older_than); }

  const cookies = all(sql, params);
  let deleted = 0;

  for (const c of cookies) {
    try { fs.unlinkSync(c.cookie_file_path); } catch {}
    run('DELETE FROM cookies WHERE id = ?', [c.id]);
    deleted++;
  }

  return deleted;
}

function getCookieStats() {
  const total = get('SELECT COUNT(*) as c FROM cookies')?.c || 0;
  const active = get("SELECT COUNT(*) as c FROM cookies WHERE status='active'")?.c || 0;
  const expired = get("SELECT COUNT(*) as c FROM cookies WHERE status='expired'")?.c || 0;
  const invalid = get("SELECT COUNT(*) as c FROM cookies WHERE status='invalid'")?.c || 0;
  const disabled = get("SELECT COUNT(*) as c FROM cookies WHERE status='disabled'")?.c || 0;

  const byPlatform = {};
  const platforms = all("SELECT platform, COUNT(*) as c FROM cookies GROUP BY platform");
  platforms.forEach(p => byPlatform[p.platform] = p.c);

  return { total, active, expired, invalid, disabled, by_platform: byPlatform };
}

// Mark expired cookies periodically
function checkExpiredCookies() {
  const updated = run(`
    UPDATE cookies SET status = 'expired'
    WHERE expires_at < CURRENT_TIMESTAMP AND status = 'active'
  `);
  if (updated.changes > 0) logger.info(`Marked ${updated.changes} cookies as expired`);
}

module.exports = {
  uploadCookie,
  getCookiesForPlatform,
  selectBestCookie,
  getCookieFilePath,
  recordCookieSuccess,
  recordCookieFailure,
  logCookieUsage,
  getCookieList,
  deleteCookie,
  bulkDeleteCookies,
  getCookieStats,
  checkExpiredCookies,
};
