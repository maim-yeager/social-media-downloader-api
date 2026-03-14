require('dotenv').config();
const http = require('http');
const { WebSocketServer } = require('ws');
const app = require('./src/app');
const { initDatabase } = require('./src/utils/db');
const { initFolders } = require('./src/utils/helpers');
const { startJobs } = require('./src/jobs');
const { checkAndUpdateYtDlp } = require('./src/jobs/ytDlpUpdate');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3007;

async function startServer() {
  try {
    // Initialize folders
    await initFolders();
    logger.info('Folders initialized');

    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Create HTTP server
    const server = http.createServer(app);

    // WebSocket server for real-time updates
    const wss = new WebSocketServer({ server, path: '/ws' });
    app.set('wss', wss);
    global.wss = wss; // Fix: expose globally for downloadManager broadcast

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const apiKey = url.searchParams.get('api_key') || req.headers['x-api-key'];

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          ws.subscriptions = ws.subscriptions || [];
          if (msg.subscribe) ws.subscriptions.push(msg.subscribe);
          if (msg.downloadId) ws.downloadId = msg.downloadId;
        } catch (e) {
          // ignore parse errors
        }
      });

      ws.on('error', (err) => logger.debug('WS error:', err.message));
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    // Start server - listen on 0.0.0.0 for fly.io
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Social Media Downloader API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Data path: ${process.env.DATA_PATH || '/data'}`);
    });

    // Start background jobs
    startJobs();
    logger.info('Background jobs started');

    // Check for yt-dlp updates
    checkAndUpdateYtDlp().catch(err => logger.warn('yt-dlp update check failed:', err.message));

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function gracefulShutdown(server) {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

startServer();
