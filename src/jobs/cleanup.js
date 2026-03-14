const fs = require('fs');
const path = require('path');
const { TEMP_PATH, TEMP_RETENTION_HOURS } = require('../config/constants');
const { run } = require('../utils/db');
const logger = require('../utils/logger');

async function cleanupTempFiles() {
  const cutoffMs = Date.now() - (TEMP_RETENTION_HOURS * 60 * 60 * 1000);
  let deleted = 0;
  let freed = 0;

  const dirsToClean = [
    TEMP_PATH,
    path.join(TEMP_PATH, 'incomplete'),
    path.join(TEMP_PATH, 'failed'),
    path.join(TEMP_PATH, 'previews'),
  ];

  for (const dir of dirsToClean) {
    if (!fs.existsSync(dir)) continue;

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          freed += stat.size;
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {}
    }
  }

  // Also expire downloads in DB
  try {
    run(`
      UPDATE downloads
      SET status = 'expired'
      WHERE status = 'completed'
      AND expires_at < CURRENT_TIMESTAMP
    `);
  } catch {}

  if (deleted > 0) {
    const mb = (freed / 1024 / 1024).toFixed(1);
    logger.info(`Cleanup: deleted ${deleted} temp files, freed ${mb} MB`);
  }

  return { deleted, freed };
}

module.exports = { cleanupTempFiles };
