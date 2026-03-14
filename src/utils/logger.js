const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOG_PATH = process.env.LOG_PATH || path.join(process.env.DATA_PATH || '/data', 'logs');

// Ensure log dir exists
try { fs.mkdirSync(LOG_PATH, { recursive: true }); } catch (e) {}

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

const transports = [
  new winston.transports.File({
    filename: path.join(LOG_PATH, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: path.join(LOG_PATH, 'combined.log'),
    maxsize: 10 * 1024 * 1024,
    maxFiles: 10,
  }),
];

if (process.env.ENABLE_CONSOLE_LOG !== 'false') {
  transports.push(new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info',
  }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format,
  transports,
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_PATH, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_PATH, 'rejections.log') }),
  ],
});

// WebSocket log streaming
const logSubscribers = new Set();

logger.stream = {
  write: (message) => logger.http(message.trim()),
};

logger.subscribe = (ws) => logSubscribers.add(ws);
logger.unsubscribe = (ws) => logSubscribers.delete(ws);
logger.broadcast = (entry) => {
  const message = JSON.stringify(entry);
  logSubscribers.forEach((ws) => {
    try { ws.send(message); } catch (e) { logSubscribers.delete(ws); }
  });
};

// Hook into winston to broadcast
logger.on('data', (log) => {
  if (logSubscribers.size > 0) {
    logger.broadcast(log);
  }
});

module.exports = logger;
