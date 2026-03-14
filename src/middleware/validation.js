const { isValidUrl } = require('../utils/helpers');
const { detectPlatform } = require('../services/platformDetector');
const { APIError } = require('./errorHandler');
const { ERROR_CODES } = require('../config/constants');

function validateUrl(req, res, next) {
  const url = req.body?.url || req.query?.url;
  if (!url) {
    return next(new APIError('URL is required', ERROR_CODES.INVALID_URL, 400));
  }
  if (!isValidUrl(url)) {
    return next(new APIError('Invalid URL format', ERROR_CODES.INVALID_URL, 400));
  }
  next();
}

function validateDownloadRequest(req, res, next) {
  const { url, type, ext } = req.body;

  if (!url) return next(new APIError('URL is required', ERROR_CODES.INVALID_URL, 400));
  if (!isValidUrl(url)) return next(new APIError('Invalid URL', ERROR_CODES.INVALID_URL, 400));

  const validTypes = ['video', 'audio', 'photo', 'auto'];
  if (type && !validTypes.includes(type)) {
    return next(new APIError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, ERROR_CODES.INVALID_FORMAT, 400));
  }

  const validExt = ['mp4', 'webm', 'mkv', 'mp3', 'm4a', 'flac', 'opus', 'wav', 'jpg', 'png', 'webp', 'gif'];
  if (ext && !validExt.includes(ext)) {
    return next(new APIError(`Invalid extension. Must be one of: ${validExt.join(', ')}`, ERROR_CODES.INVALID_FORMAT, 400));
  }

  next();
}

module.exports = { validateUrl, validateDownloadRequest };
