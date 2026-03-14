const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_PATH = process.env.DB_PATH || path.join(process.env.DATA_PATH || '/data', 'database.sqlite');

let db;

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

async function initDatabase() {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  runMigrations();
  logger.info(`Database initialized: ${DB_PATH}`);
  return db;
}

// Safely add missing columns to existing tables (for upgrades from old DB)
function runColumnMigrations() {
  const alterations = [
    { table: 'cookies',    column: 'expires_at',           sql: 'ALTER TABLE cookies ADD COLUMN expires_at TIMESTAMP' },
    { table: 'cookies',    column: 'notes',                sql: 'ALTER TABLE cookies ADD COLUMN notes TEXT' },
    { table: 'cookies',    column: 'consecutive_failures', sql: 'ALTER TABLE cookies ADD COLUMN consecutive_failures INTEGER DEFAULT 0' },
    { table: 'downloads',  column: 'expires_at',           sql: 'ALTER TABLE downloads ADD COLUMN expires_at TIMESTAMP' },
    { table: 'downloads',  column: 'cookie_id',            sql: 'ALTER TABLE downloads ADD COLUMN cookie_id TEXT' },
    { table: 'downloads',  column: 'ip_address',           sql: 'ALTER TABLE downloads ADD COLUMN ip_address TEXT' },
    { table: 'api_keys',   column: 'expires_at',           sql: 'ALTER TABLE api_keys ADD COLUMN expires_at TIMESTAMP' },
    { table: 'cache_meta', column: 'expires_at',           sql: 'ALTER TABLE cache_meta ADD COLUMN expires_at TIMESTAMP' },
    { table: 'cache_meta', column: 'last_accessed',        sql: 'ALTER TABLE cache_meta ADD COLUMN last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    { table: 'stats',      column: 'total_downloads',      sql: 'ALTER TABLE stats ADD COLUMN total_downloads INTEGER DEFAULT 0' },
    { table: 'stats',      column: 'total_bytes',          sql: 'ALTER TABLE stats ADD COLUMN total_bytes INTEGER DEFAULT 0' },
    { table: 'stats',      column: 'platform_counts',      sql: "ALTER TABLE stats ADD COLUMN platform_counts TEXT DEFAULT '{}'" },
    { table: 'stats',      column: 'updated_at',           sql: 'ALTER TABLE stats ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
  ];

  for (const { table, column, sql } of alterations) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      const exists = cols.some(c => c.name === column);
      if (!exists) {
        db.exec(sql);
        logger.info(`Migration: added column ${column} to ${table}`);
      }
    } catch (e) {
      // Table may not exist yet — will be created below
    }
  }
}

function runMigrations() {
  runColumnMigrations();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cookies (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      cookie_file_path TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      priority INTEGER DEFAULT 3,
      fail_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      consecutive_failures INTEGER DEFAULT 0,
      last_used TIMESTAMP,
      last_tested TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      UNIQUE(platform, account_name)
    );
    CREATE INDEX IF NOT EXISTS idx_cookies_platform ON cookies(platform);
    CREATE INDEX IF NOT EXISTS idx_cookies_status ON cookies(status);
    CREATE INDEX IF NOT EXISTS idx_cookies_priority ON cookies(priority);
    CREATE INDEX IF NOT EXISTS idx_cookies_platform_status ON cookies(platform, status);
    CREATE INDEX IF NOT EXISTS idx_cookies_expires ON cookies(expires_at);

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      platform TEXT,
      media_type TEXT,
      format_id TEXT,
      quality TEXT,
      status TEXT DEFAULT 'queued',
      progress REAL DEFAULT 0,
      downloaded INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      speed INTEGER DEFAULT 0,
      eta INTEGER DEFAULT 0,
      error_message TEXT,
      output_path TEXT,
      filename TEXT,
      filesize INTEGER,
      cookie_id TEXT,
      ip_address TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cookie_id) REFERENCES cookies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at);

    CREATE TABLE IF NOT EXISTS cookie_logs (
      id TEXT PRIMARY KEY,
      cookie_id TEXT,
      platform TEXT,
      download_id TEXT,
      success INTEGER,
      error_message TEXT,
      response_time INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cookie_id) REFERENCES cookies(id),
      FOREIGN KEY (download_id) REFERENCES downloads(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cookie_logs_cookie ON cookie_logs(cookie_id);
    CREATE INDEX IF NOT EXISTS idx_cookie_logs_created ON cookie_logs(created_at);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      permissions TEXT DEFAULT '["read"]',
      rate_limit INTEGER DEFAULT 1000,
      is_active INTEGER DEFAULT 1,
      last_used TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY DEFAULT 'global',
      total_downloads INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      platform_counts TEXT DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO stats (id) VALUES ('global');

    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      url TEXT,
      type TEXT,
      file_path TEXT,
      filesize INTEGER,
      hits INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_meta(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cache_accessed ON cache_meta(last_accessed);
  `);
}

// Helper methods
const dbHelpers = {
  get: (sql, params = []) => {
    return getDb().prepare(sql).get(...params);
  },
  all: (sql, params = []) => {
    return getDb().prepare(sql).all(...params);
  },
  run: (sql, params = []) => {
    return getDb().prepare(sql).run(...params);
  },
  transaction: (fn) => {
    return getDb().transaction(fn)();
  },
};

module.exports = { initDatabase, getDb, ...dbHelpers };
