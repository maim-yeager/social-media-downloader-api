const path = require('path');

const DATA_PATH = process.env.DATA_PATH || '/data';

module.exports = {
  DATA_PATH,
  COOKIE_PATH: process.env.COOKIE_PATH || path.join(DATA_PATH, 'cookies'),
  TEMP_PATH: process.env.TEMP_PATH || path.join(DATA_PATH, 'temp'),
  CACHE_PATH: process.env.CACHE_PATH || path.join(DATA_PATH, 'cache'),
  LOG_PATH: process.env.LOG_PATH || path.join(DATA_PATH, 'logs'),
  DB_PATH: process.env.DB_PATH || path.join(DATA_PATH, 'database.sqlite'),
  BACKUP_PATH: process.env.BACKUP_PATH || path.join(DATA_PATH, 'backups'),

  // Download
  MAX_CONCURRENT_DOWNLOADS: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS) || 5,
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 * 1024,
  TEMP_RETENTION_HOURS: parseInt(process.env.TEMP_RETENTION_HOURS) || 1,
  DOWNLOAD_TIMEOUT: parseInt(process.env.DOWNLOAD_TIMEOUT) || 3600,

  // Cookie
  COOKIE_FAIL_THRESHOLD: parseInt(process.env.COOKIE_FAIL_THRESHOLD) || 5,
  MAX_COOKIE_AGE_DAYS: parseInt(process.env.MAX_COOKIE_AGE_DAYS) || 30,
  COOKIE_ROTATION_STRATEGY: process.env.COOKIE_ROTATION_STRATEGY || 'weighted',

  // Cache
  CACHE_TTL_HOURS: parseInt(process.env.CACHE_TTL_HOURS) || 24,
  MAX_CACHE_SIZE_MB: parseInt(process.env.MAX_CACHE_SIZE_MB) || 500,
  MAX_CACHE_FILES: parseInt(process.env.MAX_CACHE_FILES) || 1000,
  PREVIEW_CACHE_TTL_HOURS: parseInt(process.env.PREVIEW_CACHE_TTL_HOURS) || 1,
  THUMBNAIL_CACHE_TTL_HOURS: parseInt(process.env.THUMBNAIL_CACHE_TTL_HOURS) || 168,
  MAX_MEMORY_CACHE_MB: parseInt(process.env.MAX_MEMORY_CACHE_MB) || 100,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  RATE_LIMIT_MAX_DOWNLOADS: parseInt(process.env.RATE_LIMIT_MAX_DOWNLOADS) || 20,

  // Errors
  ERROR_CODES: {
    INVALID_URL: 'INVALID_URL',
    UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
    MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
    COOKIE_REQUIRED: 'COOKIE_REQUIRED',
    ALL_COOKIES_FAILED: 'ALL_COOKIES_FAILED',
    RATE_LIMITED: 'RATE_LIMITED',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FORMAT: 'INVALID_FORMAT',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    FORMAT_UNAVAILABLE: 'FORMAT_UNAVAILABLE',
    MERGE_FAILED: 'MERGE_FAILED',
    TIMEOUT: 'TIMEOUT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },

  // Video quality map
  QUALITY_MAP: {
    '8k': 4320,
    '4k': 2160,
    '2k': 1440,
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360,
    '240p': 240,
    '144p': 144,
    'best': null,
    'worst': null,
  },

  // Audio formats
  AUDIO_FORMATS: ['mp3', 'm4a', 'flac', 'opus', 'wav', 'ogg', 'aac'],

  // Video formats
  VIDEO_FORMATS: ['mp4', 'webm', 'mkv', 'avi', 'mov'],

  // Image formats
  IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'],

  VERSION: '1.0.0',
};
