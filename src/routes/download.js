const express = require('express');
const router = express.Router();
const { startDownload, getProgress, serveFile, listDownloads } = require('../controllers/downloadController');
const { validateDownloadRequest } = require('../middleware/validation');
const { downloadLimiter } = require('../middleware/rateLimit');

// IMPORTANT: static/named routes must be defined BEFORE param routes
// otherwise '/file/:id' would be swallowed by '/:id/progress'

router.post('/', downloadLimiter, validateDownloadRequest, startDownload);
router.get('/', listDownloads);

// Serve a completed file — must come before /:id/progress
router.get('/file/:id/:filename', serveFile);
router.get('/file/:id', serveFile);

// Progress for a download job
router.get('/:id/progress', getProgress);

module.exports = router;
