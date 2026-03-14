const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/adminController');

router.get('/', getStats);

module.exports = router;
