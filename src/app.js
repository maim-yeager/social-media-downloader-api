const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS - allow all origins for public API
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'X-Download-ID'],
  credentials: false,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// HTTP logging
if (process.env.ENABLE_REQUEST_LOGGING !== 'false') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) }
  }));
}

// Static file serving for downloads
const dataPath = process.env.DATA_PATH || '/data';
app.use('/files', express.static(path.join(dataPath, 'temp'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Routes
app.use('/', routes);

// Error handling
app.use(errorHandler);

module.exports = app;
