// middleware/auth.js
const { get } = require('../utils/db');

const API_KEY = process.env.API_KEY || 'maimbro@#097';
const API_KEY_HEADER = process.env.API_KEY_HEADER || 'x-api-key';

function requireApiKey(req, res, next) {
  const key = req.headers[API_KEY_HEADER.toLowerCase()] ||
               req.headers['authorization']?.replace('Bearer ', '') ||
               req.query.api_key;

  if (!key) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'API key required' },
    });
  }

  // Check master key
  if (key === API_KEY) {
    req.apiKey = { permissions: ['read', 'write', 'admin'], name: 'master' };
    return next();
  }

  // Check DB keys
  try {
    const dbKey = get('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1', [key]);
    if (dbKey) {
      if (dbKey.expires_at && new Date(dbKey.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'API key expired' } });
      }
      req.apiKey = { ...dbKey, permissions: JSON.parse(dbKey.permissions) };
      return next();
    }
  } catch {}

  return res.status(401).json({
    success: false,
    error: { code: 'AUTH_REQUIRED', message: 'Invalid API key' },
  });
}

function optionalApiKey(req, res, next) {
  const key = req.headers[API_KEY_HEADER.toLowerCase()] ||
               req.headers['authorization']?.replace('Bearer ', '') ||
               req.query.api_key;

  if (key === API_KEY) {
    req.apiKey = { permissions: ['read', 'write', 'admin'], name: 'master' };
  }
  next();
}

module.exports = { requireApiKey, optionalApiKey };
