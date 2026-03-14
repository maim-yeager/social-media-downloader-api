// src/routes/index.js
const express = require('express');
const router = express.Router();
const { generalLimiter } = require('../middleware/rateLimit');
const { optionalApiKey } = require('../middleware/auth');

// Apply optional API key and general rate limiter globally
router.use(optionalApiKey);
if (process.env.ENABLE_RATE_LIMITING !== 'false') {
  router.use(generalLimiter);
}

// Health (public)
router.use('/health', require('./health'));

// Public API
router.use('/api/extract', require('./extract'));
router.use('/api/download', require('./download'));
router.use('/api/preview', require('./preview'));
router.use('/api/proxy', require('./proxy'));
router.use('/api/stats', require('./stats'));

// Admin API (protected)
router.use('/api/admin', require('./admin'));

// Root info
router.get('/', (req, res) => {
  res.json({
    name: 'Social Media Downloader API',
    version: '1.0.0',
    docs: '/api/docs',
    health: '/health',
    endpoints: {
      extract: 'POST /api/extract',
      formats: 'POST /api/extract/formats',
      download: 'POST /api/download',
      progress: 'GET /api/download/:id/progress',
      preview: 'GET /api/preview?url=',
      thumbnail: 'GET /api/preview/thumbnail?url=',
      proxy: 'GET /api/proxy?url=',
      stats: 'GET /api/stats',
    },
  });
});

module.exports = router;
