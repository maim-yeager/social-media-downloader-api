const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const logger = require('../utils/logger');

async function checkAndUpdateYtDlp() {
  try {
    const { stdout: currentRaw } = await execAsync('yt-dlp --version 2>&1').catch(() => ({ stdout: 'not found' }));
    const currentVersion = currentRaw.trim();

    if (currentVersion === 'not found') {
      logger.warn('yt-dlp not found, attempting install');
      await execAsync('curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp');
      const { stdout: newVer } = await execAsync('yt-dlp --version');
      logger.info(`yt-dlp installed: ${newVer.trim()}`);
      return { installed: true, version: newVer.trim() };
    }

    // Fetch latest from GitHub
    let latestVersion;
    try {
      const response = await axios.get(
        'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
        { timeout: 15000, headers: { 'User-Agent': 'social-media-downloader-api' } }
      );
      latestVersion = response.data.tag_name;
    } catch {
      logger.debug('Could not check yt-dlp latest version');
      return { current: currentVersion, skipped: true };
    }

    if (currentVersion !== latestVersion) {
      logger.info(`Updating yt-dlp: ${currentVersion} → ${latestVersion}`);
      await execAsync('yt-dlp -U 2>&1');
      const { stdout: updatedVer } = await execAsync('yt-dlp --version');
      logger.info(`yt-dlp updated to ${updatedVer.trim()}`);
      return { updated: true, from: currentVersion, to: updatedVer.trim() };
    }

    logger.debug(`yt-dlp up-to-date: ${currentVersion}`);
    return { up_to_date: true, version: currentVersion };

  } catch (error) {
    logger.error('yt-dlp update failed:', error.message);
    return { error: error.message };
  }
}

module.exports = { checkAndUpdateYtDlp };
