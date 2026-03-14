const logger = require('../utils/logger');

class APIError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'APIError';
    this.code = code || 'UNKNOWN_ERROR';
    this.status = status;
  }
}

// Must have 4 arguments for Express to treat it as an error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.id || req.headers['x-request-id'] || 'unknown';

  if (err instanceof APIError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
      request_id: requestId,
    });
  }

  // JSON body parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body' },
      request_id: requestId,
    });
  }

  // Express payload too large
  if (err.status === 413) {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload too large' },
      request_id: requestId,
    });
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    request_id: requestId,
  });

  // Don't expose internals in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : err.message;

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
    request_id: requestId,
  });
}

module.exports = errorHandler;
module.exports.APIError = APIError;
