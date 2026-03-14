// jobs/backup.js
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { DATA_PATH, BACKUP_PATH } = require('../config/constants');
const logger = require('../utils/logger');

async function runAutomatedBackup() {
  try {
    const backupId = `auto_backup_${new Date().toISOString().slice(0, 10)}`;
    const tarPath = path.join(BACKUP_PATH, `${backupId}.tar.gz`);

    if (fs.existsSync(tarPath)) {
      logger.debug('Backup already exists for today');
      return;
    }

    const dbPath = process.env.DB_PATH || path.join(DATA_PATH, 'database.sqlite');
    const tmpDir = path.join(BACKUP_PATH, backupId);
    fs.mkdirSync(tmpDir, { recursive: true });

    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(tmpDir, 'database.sqlite'));
    }

    await execAsync(`tar -czf "${tarPath}" -C "${BACKUP_PATH}" "${backupId}"`);
    fs.rmSync(tmpDir, { recursive: true });

    // Cleanup old backups
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 7;
    const cutoff = Date.now() - (retentionDays * 86400000);
    const files = fs.readdirSync(BACKUP_PATH).filter(f => f.endsWith('.tar.gz'));
    for (const f of files) {
      const fpath = path.join(BACKUP_PATH, f);
      try {
        if (fs.statSync(fpath).mtimeMs < cutoff) {
          fs.unlinkSync(fpath);
          logger.debug(`Deleted old backup: ${f}`);
        }
      } catch {}
    }

    logger.info(`Automated backup created: ${backupId}`);
  } catch (error) {
    logger.error('Automated backup failed:', error.message);
  }
}

module.exports = { runAutomatedBackup };
