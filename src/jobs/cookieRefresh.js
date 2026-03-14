const { all, run } = require('../utils/db');
const { checkExpiredCookies } = require('../services/cookieManager');
const logger = require('../utils/logger');

async function checkCookieHealth() {
  try {
    checkExpiredCookies();

    // Disable cookies with too many consecutive failures
    const problematic = all(`
      SELECT id, platform, account_name, consecutive_failures
      FROM cookies
      WHERE status = 'active'
      AND consecutive_failures >= ?
    `, [parseInt(process.env.COOKIE_FAIL_THRESHOLD) || 5]);

    for (const cookie of problematic) {
      run(`UPDATE cookies SET status = 'disabled', notes = 'Auto-disabled: too many failures' WHERE id = ?`, [cookie.id]);
      logger.warn(`Cookie auto-disabled: ${cookie.platform}/${cookie.account_name}`);
    }

    const stats = {
      active: all("SELECT COUNT(*) as c FROM cookies WHERE status='active'")[0]?.c || 0,
      expired: all("SELECT COUNT(*) as c FROM cookies WHERE status='expired'")[0]?.c || 0,
      disabled: all("SELECT COUNT(*) as c FROM cookies WHERE status='disabled'")[0]?.c || 0,
    };

    logger.debug('Cookie health check complete:', stats);
    return stats;
  } catch (error) {
    logger.error('Cookie health check failed:', error.message);
  }
}

module.exports = { checkCookieHealth };
