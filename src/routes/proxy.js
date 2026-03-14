const express = require('express');
const router = express.Router();
const { corsProxyMiddleware } = require('../services/proxyService');

router.get('/', corsProxyMiddleware);
router.options('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, X-API-Key');
  res.status(204).end();
});

module.exports = router;
