// src/routes/extract.js
const express = require('express');
const router = express.Router();
const { extract, getFormats } = require('../controllers/extractController');
const { validateUrl } = require('../middleware/validation');

router.post('/', validateUrl, extract);
router.post('/formats', validateUrl, getFormats);

module.exports = router;
