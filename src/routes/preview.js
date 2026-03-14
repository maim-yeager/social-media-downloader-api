// src/routes/preview.js
const express = require('express');
const router = express.Router();
const { getPreview, getThumbnail } = require('../controllers/previewController');

router.get('/', getPreview);
router.post('/', getPreview);
router.get('/thumbnail', getThumbnail);

module.exports = router;
