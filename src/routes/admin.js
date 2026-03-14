const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireApiKey } = require('../middleware/auth');
const {
  listCookies,
  uploadCookieHandler,
  deleteCookieHandler,
  bulkDeleteCookiesHandler,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  createBackup,
  downloadBackup,
  listBackups,
  getLogs,
  updateYtDlp,
  triggerCleanup,
} = require('../controllers/adminController');

// All admin routes require API key
router.use(requireApiKey);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max cookie file
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt cookie files allowed'));
    }
  },
});

// ── Cookie Management ──────────────────────────────────────────────────────
router.get('/cookies', listCookies);
router.post('/cookies/upload', upload.single('cookie_file'), uploadCookieHandler);
router.delete('/cookies/:id', deleteCookieHandler);
router.delete('/cookies', bulkDeleteCookiesHandler);

// ── API Key Management ─────────────────────────────────────────────────────
router.get('/keys', listApiKeys);
router.post('/keys/create', createApiKey);
router.delete('/keys/:id', deleteApiKey);

// ── Backup Management ──────────────────────────────────────────────────────
router.get('/backup', listBackups);
router.post('/backup/create', createBackup);
router.get('/backup/download/:id', downloadBackup);

// ── Logs ───────────────────────────────────────────────────────────────────
router.get('/logs', getLogs);

// ── System Actions ─────────────────────────────────────────────────────────
router.post('/system/update-ytdlp', updateYtDlp);
router.post('/system/cleanup', triggerCleanup);

module.exports = router;
