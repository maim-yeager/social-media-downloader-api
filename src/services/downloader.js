const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { TEMP_PATH, CACHE_PATH, DOWNLOAD_TIMEOUT } = require('../config/constants');
const { sanitizeFilename, generateCacheKey, getRandomUserAgent } = require('../utils/helpers');
const { detectPlatform, detectMediaType, formatMediaInfo, normalizeFormats } = require('./platformDetector');
const { selectBestCookie, recordCookieSuccess, recordCookieFailure, logCookieUsage } = require('./cookieManager');
const logger = require('../utils/logger');

// Detect ffmpeg location once at startup
const FFMPEG_PATH = (() => {
  const candidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const c of candidates) {
    try {
      require('child_process').execSync(`"${c}" -version`, { stdio: 'pipe' });
      return c;
    } catch {}
  }
  return 'ffmpeg';
})();

// Build yt-dlp base args
function buildBaseArgs(options = {}) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--prefer-free-formats',
    '--user-agent', getRandomUserAgent(),
    '--socket-timeout', '30',
    '--retries', '3',
    '--fragment-retries', '3',
  ];

  if (process.env.PROXY_ENABLED === 'true' && process.env.PROXY_URL) {
    args.push('--proxy', process.env.PROXY_URL);
  }

  if (options.cookieFile) {
    args.push('--cookies', options.cookieFile);
  }

  return args;
}

async function extractInfo(url, options = {}) {
  const platform = detectPlatform(url);
  const cookie = !options.noCookies ? selectBestCookie(platform) : null;

  const args = [
    ...buildBaseArgs({ cookieFile: cookie?.cookie_file_path }),
    '--dump-json',
    '--skip-download',
  ];

  // If playlist mode requested, remove the --no-playlist added by buildBaseArgs
  if (options.playlist) {
    const idx = args.indexOf('--no-playlist');
    if (idx !== -1) args.splice(idx, 1);
  }

  args.push(url);

  return new Promise((resolve, reject) => {
    let proc;
    const timeout = setTimeout(() => {
      if (proc) proc.kill('SIGKILL');
      reject(new Error('Extraction timed out'));
    }, 60000);

    let output = '';
    let errOutput = '';

    try {
      proc = spawn('yt-dlp', args);
    } catch (spawnErr) {
      clearTimeout(timeout);
      return reject(new Error(`Failed to spawn yt-dlp: ${spawnErr.message}`));
    }

    proc.stdout.on('data', d => { output += d.toString(); });
    proc.stderr.on('data', d => { errOutput += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && output.trim()) {
        try {
          const lines = output.trim().split('\n').filter(l => l.trim());
          const infos = lines.map(l => {
            try { return JSON.parse(l); } catch { return null; }
          }).filter(Boolean);

          if (infos.length === 0) {
            return reject(new Error('yt-dlp returned no parseable JSON'));
          }

          const info = infos[0];
          if (cookie) recordCookieSuccess(cookie.id);
          resolve({ info, allInfos: infos, cookie });
        } catch (e) {
          reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
        }
      } else {
        if (cookie) recordCookieFailure(cookie.id, errOutput.slice(0, 200));
        reject(new Error(parseError(errOutput) || errOutput.slice(0, 500) || 'Extraction failed'));
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timeout);
      reject(new Error(`yt-dlp not found or failed to start: ${e.message}`));
    });
  });
}

async function downloadMedia(url, options = {}) {
  const {
    formatId,
    quality,
    type = 'video',
    ext = 'mp4',
    downloadId = uuidv4(),
    onProgress,
    embedMetadata = true,
    subtitles,
  } = options;

  const platform = detectPlatform(url);
  const cookie = selectBestCookie(platform);
  const outputTemplate = path.join(TEMP_PATH, `${downloadId}.%(ext)s`);
  const formatSelector = buildFormatSelector(formatId, quality, type, ext);

  logger.info(`[${downloadId}] Starting download type=${type} ext=${ext} format="${formatSelector}" url=${url}`);

  const args = [
    ...buildBaseArgs({ cookieFile: cookie?.cookie_file_path }),
    '--format', formatSelector,
    '--output', outputTemplate,
    '--newline',
    '--progress',
    '--ffmpeg-location', FFMPEG_PATH,
  ];

  if (type !== 'audio' && type !== 'photo') {
    args.push('--merge-output-format', ext);
    args.push('-N', '4');
    args.push('--concurrent-fragments', '4');
  }

  if (type === 'audio') {
    args.push('--extract-audio');
    const audioFormat = ext || 'mp3';
    args.push('--audio-format', audioFormat);
    if (audioFormat === 'mp3') {
      const qualityMap = { '320kbps': '0', '192kbps': '5', '128kbps': '9' };
      args.push('--audio-quality', qualityMap[quality] || '5');
    }
    // NOTE: --embed-thumbnail intentionally omitted — it crashes when thumbnail fetch fails
  }

  // Add metadata ONCE (base args no longer include --add-metadata)
  if (embedMetadata) {
    args.push('--add-metadata');
  }

  if (subtitles && subtitles.length > 0) {
    args.push('--write-subs');
    args.push('--sub-langs', subtitles.join(','));
    args.push('--embed-subs');
  }

  args.push(url);

  return new Promise((resolve, reject) => {
    let proc;
    const timeoutMs = (DOWNLOAD_TIMEOUT || 3600) * 1000;
    const timeout = setTimeout(() => {
      if (proc) proc.kill('SIGKILL');
      reject(new Error('Download timed out'));
    }, timeoutMs);

    let errOutput = '';

    try {
      proc = spawn('yt-dlp', args);
    } catch (spawnErr) {
      clearTimeout(timeout);
      return reject(new Error(`Failed to spawn yt-dlp: ${spawnErr.message}`));
    }

    proc.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        const progress = parseYtdlpProgress(line);
        if (progress && onProgress) onProgress(progress);
      }
    });

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      errOutput += chunk;
      for (const line of chunk.split('\n')) {
        const progress = parseYtdlpProgress(line);
        if (progress && onProgress) onProgress(progress);
      }
    });

    proc.on('close', async (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Small delay to ensure filesystem flush
        await new Promise(r => setTimeout(r, 300));
        const outputFile = findOutputFile(downloadId);
        if (outputFile) {
          if (cookie) {
            recordCookieSuccess(cookie.id);
            logCookieUsage(cookie.id, downloadId, true);
          }
          logger.info(`[${downloadId}] Complete: ${outputFile}`);
          resolve({ filePath: outputFile, cookieId: cookie?.id });
        } else {
          const tempFiles = fs.existsSync(TEMP_PATH) ? fs.readdirSync(TEMP_PATH) : [];
          logger.error(`[${downloadId}] File missing. Temp contents: ${tempFiles.join(', ')}`);
          reject(new Error('Download completed but output file not found'));
        }
      } else {
        if (cookie) {
          recordCookieFailure(cookie.id, errOutput.slice(0, 200));
          logCookieUsage(cookie.id, downloadId, false, new Error(errOutput));
        }
        const reason = parseError(errOutput) || `yt-dlp exited with code ${code}`;
        logger.error(`[${downloadId}] Failed (code ${code}): ${reason}`);
        reject(new Error(reason));
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timeout);
      reject(new Error(`yt-dlp execution failed: ${e.message}`));
    });
  });
}

function buildFormatSelector(formatId, quality, type, ext) {
  // Explicit valid format ID (not a generic keyword)
  if (formatId && !['best', 'auto', 'bestvideo+bestaudio'].includes(formatId)) {
    return formatId;
  }

  if (type === 'audio') return 'bestaudio/best';
  if (type === 'photo') return 'best';

  if (quality) {
    const heightMap = {
      '8k': 4320, '4k': 2160, '2k': 1440,
      '1080p': 1080, '720p': 720, '480p': 480,
      '360p': 360, '240p': 240, '144p': 144,
    };
    const height = heightMap[quality.toLowerCase()];
    if (height) {
      if (ext === 'mp4') {
        return `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
      }
      return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    }
  }

  if (!ext || ext === 'mp4') {
    return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
  }
  if (ext === 'webm') {
    return 'bestvideo[ext=webm]+bestaudio[ext=webm]/bestvideo+bestaudio/best';
  }
  return 'bestvideo+bestaudio/best';
}

function findOutputFile(downloadId) {
  if (!fs.existsSync(TEMP_PATH)) return null;
  const files = fs.readdirSync(TEMP_PATH);
  const found = files.find(f => path.basename(f, path.extname(f)) === downloadId);
  return found ? path.join(TEMP_PATH, found) : null;
}

function parseYtdlpProgress(line) {
  if (!line) return null;
  // Matches: [download]  45.5% of ~500.00MiB at 5.00MiB/s ETA 00:52
  const match = line.match(
    /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+)(\w+)\s+at\s+([\d.]+|Unknown)([\w/]+)\s+ETA\s+([\d:]+|Unknown)/
  );
  if (!match) return null;

  const percent = parseFloat(match[1]);
  const totalBytes = parseSize(match[2], match[3]);
  const speedBytes = match[4] === 'Unknown' ? 0 : parseSize(match[4], match[5].replace('/s', ''));
  const etaSecs = parseEta(match[6]);

  return {
    percent,
    downloaded: Math.floor(totalBytes * percent / 100),
    total: totalBytes,
    speed: speedBytes,
    eta: etaSecs,
  };
}

function parseEta(etaStr) {
  if (!etaStr || etaStr === 'Unknown') return 0;
  const parts = etaStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseSize(num, unit) {
  const n = parseFloat(num);
  if (isNaN(n)) return 0;
  const u = (unit || '').toUpperCase().replace('/S', '');
  const map = {
    B: 1,
    KIB: 1024, MIB: 1024 * 1024, GIB: 1024 * 1024 * 1024,
    KB: 1000, MB: 1000 * 1000, GB: 1000 * 1000 * 1000,
    K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024,
  };
  return Math.floor(n * (map[u] || 1));
}

function parseError(stderr) {
  if (!stderr) return null;
  if (stderr.includes('Private video')) return 'This video is private';
  if (stderr.includes('Video unavailable')) return 'Video unavailable';
  if (stderr.includes('age-restricted') || stderr.includes('age restricted')) return 'Age-restricted content – login required';
  if (stderr.includes('Sign in') || stderr.includes('login required') || stderr.includes('Login Required')) return 'Login required – add a cookie file';
  if (stderr.includes('rate limit') || stderr.includes('429')) return 'Rate limited by platform, try again later';
  if (stderr.includes('404')) return 'Content not found (404)';
  if (stderr.includes('403')) return 'Access forbidden (403)';
  if (stderr.includes('Premieres') || stderr.includes('premiere')) return 'Video has not premiered yet';
  if (stderr.includes('members-only') || stderr.includes('members only')) return 'Members-only content';
  if (stderr.includes('copyright')) return 'Content blocked due to copyright';
  if (stderr.includes('ffmpeg')) return 'ffmpeg error during merge – ensure ffmpeg is installed';
  const lines = stderr.split('\n').filter(l => /ERROR/i.test(l));
  return lines[lines.length - 1]?.replace(/^.*ERROR[:\s]*/i, '').trim() || null;
}

module.exports = { extractInfo, downloadMedia, buildBaseArgs };
