const express = require('express');
const router = express.Router();
const { getHealth } = require('../controllers/adminController');

router.get('/', getHealth);

module.exports = router;
