const cron = require('node-cron');
const { cleanupTempFiles } = require('./cleanup');
const { cleanupExpired: cleanupCache } = require('../services/cacheManager');
const { checkCookieHealth } = require('./cookieRefresh');
const { checkAndUpdateYtDlp } = require('./ytDlpUpdate');
const { runAutomatedBackup } = require('./backup');
const logger = require('../utils/logger');

function startJobs() {
  // Cleanup temp files every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    logger.debug('Running temp cleanup...');
    await cleanupTempFiles().catch(e => logger.error('Cleanup job error:', e.message));
  });

  // Cache cleanup every hour
  cron.schedule('0 * * * *', async () => {
    logger.debug('Running cache cleanup...');
    await cleanupCache().catch(e => logger.error('Cache cleanup error:', e.message));
  });

  // Cookie health check every hour
  cron.schedule('5 * * * *', async () => {
    logger.debug('Running cookie health check...');
    await checkCookieHealth().catch(e => logger.error('Cookie health error:', e.message));
  });

  // yt-dlp update check daily at 3am
  cron.schedule('0 3 * * *', async () => {
    logger.info('Checking yt-dlp for updates...');
    await checkAndUpdateYtDlp().catch(e => logger.error('yt-dlp update error:', e.message));
  });

  // Automated backup daily at 2am
  const backupSchedule = process.env.BACKUP_SCHEDULE || '0 2 * * *';
  cron.schedule(backupSchedule, async () => {
    logger.info('Running automated backup...');
    await runAutomatedBackup().catch(e => logger.error('Backup job error:', e.message));
  });

  logger.info('All background jobs scheduled');
}

module.exports = { startJobs };
