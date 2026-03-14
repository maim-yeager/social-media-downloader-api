const rateLimit = require('express-rate-limit');
const {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_DOWNLOADS,
} = require('../config/constants');

const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.apiKey?.permissions?.includes('admin'),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' },
    });
  },
});

const downloadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_DOWNLOADS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.apiKey?.permissions?.includes('admin'),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Download limit reached. Try again later.' },
    });
  },
});

module.exports = { generalLimiter, downloadLimiter };
