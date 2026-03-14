const axios = require('axios');
const { getRandomUserAgent } = require('../utils/helpers');
const logger = require('../utils/logger');

// PRIVATE_IP_RE matches RFC-1918, loopback, link-local and other non-public ranges
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|::1|localhost|fd[0-9a-f]{2}:)/i;

async function proxyRequest(url, options = {}) {
  const {
    headers = {},
    method = 'GET',
    responseType = 'stream',
    timeout = 30000,
  } = options;

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = 'https://www.google.com';
  }

  const requestHeaders = {
    'User-Agent': getRandomUserAgent(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': origin,
    ...headers,
  };

  const response = await axios({
    method,
    url,
    headers: requestHeaders,
    responseType,
    timeout,
    maxRedirects: parseInt(process.env.PROXY_MAX_REDIRECTS) || 5,
    decompress: true,
  });

  return response;
}

// Express middleware for CORS proxy
async function corsProxyMiddleware(req, res, next) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Block SSRF: reject private/loopback addresses
  const hostname = parsedUrl.hostname;
  if (PRIVATE_IP_RE.test(hostname)) {
    return res.status(403).json({ error: 'Private/loopback URLs are not allowed' });
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are supported' });
  }

  try {
    const options = { responseType: 'stream' };

    if (req.headers.range) {
      options.headers = { Range: req.headers.range };
    }

    const upstream = await proxyRequest(targetUrl, options);

    // Forward safe headers
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
    forwardHeaders.forEach(h => {
      if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.status(upstream.status || 200);

    upstream.data.on('error', (err) => {
      logger.debug(`Proxy upstream error for ${targetUrl}: ${err.message}`);
      if (!res.headersSent) res.status(502).end();
    });

    upstream.data.pipe(res);

  } catch (error) {
    logger.debug(`Proxy error for ${targetUrl}: ${error.message}`);
    if (!res.headersSent) {
      const status = error.response?.status || 502;
      res.status(status).json({ error: 'Proxy request failed', message: error.message });
    }
  }
}

module.exports = { proxyRequest, corsProxyMiddleware };
