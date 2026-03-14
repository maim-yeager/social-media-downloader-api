# Social Media Downloader API

A production-ready API for downloading media from 15+ social platforms with CORS bypass, intelligent cookie management, download queue, and full admin panel.

## Features

- ✅ **15+ Platforms** — YouTube, TikTok, Instagram, Facebook, Twitter/X, Pinterest, Reddit, LinkedIn, Telegram, Vimeo, Dailymotion, Twitch, SoundCloud, Spotify, Streamable
- ✅ **All Media Types** — video, audio, photos, carousels, stories, playlists, live streams
- ✅ **CORS Bypass Proxy** — `GET /api/proxy?url=` proxies any media URL with CORS headers
- ✅ **Cookie Management** — multi-account rotation with priority, health checks, and auto-disable
- ✅ **Download Queue** — concurrent downloads with real-time WebSocket progress
- ✅ **Multi-level Cache** — memory (NodeCache) + disk cache for metadata, thumbnails, formats
- ✅ **FFmpeg Merging** — automatic video+audio merge with codec copy (no re-encoding)
- ✅ **Audio Extraction** — MP3, M4A, FLAC, OPUS, WAV with metadata embedding
- ✅ **Auto yt-dlp Updates** — checks GitHub on startup and daily
- ✅ **Admin Panel API** — cookies CRUD, API key management, backups, log viewer
- ✅ **Fly.io Ready** — persistent `/data` volume, health checks, auto-scaling config

---

## Quick Start

### Local with Docker Compose

```bash
git clone <repo>
cd social-media-downloader-api

# Copy and edit environment
cp .env.example .env

# Start
docker-compose up -d
```

### Local without Docker

```bash
npm install
cp .env.example .env
# Edit .env with DATA_PATH=./data
npm start
```

---

## Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch (first time)
flyctl launch

# Create persistent volume
flyctl volumes create data --size 10 --region sin

# Set secrets
flyctl secrets set API_KEY=your-secret-key-here

# Deploy
flyctl deploy

# Scale memory
flyctl scale memory 1024
```

---

## API Reference

### POST /api/extract
Extract media info, all formats, subtitles, and thumbnails.

```json
{
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "include_all_formats": true,
  "include_subtitles": true,
  "include_thumbnails": true
}
```

**Response:**
```json
{
  "success": true,
  "platform": "youtube",
  "media_type": "video",
  "title": "Video Title",
  "duration": 212,
  "duration_formatted": "3:32",
  "uploader": "Channel Name",
  "thumbnail": "https://...",
  "formats": [
    {
      "format_id": "137+140",
      "format_note": "1080p",
      "ext": "mp4",
      "height": 1080,
      "filesize": 45000000,
      "filesize_formatted": "45.00 MB",
      "vcodec": "h264",
      "acodec": "m4a",
      "type": "video+audio"
    }
  ],
  "subtitles": [{ "language": "en", "name": "English" }]
}
```

---

### POST /api/extract/formats
Get only the format list for a URL.

---

### POST /api/download
Start a download. Returns a `download_id` for progress polling.

```json
{
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "format_id": "137+140",
  "quality": "1080p",
  "type": "video",
  "ext": "mp4",
  "subtitles": ["en"],
  "embed_metadata": true,
  "webhook_url": "https://yourapp.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "download_id": "550e8400-...",
  "status": "downloading",
  "progress_url": "/api/download/550e8400-.../progress"
}
```

---

### GET /api/download/:id/progress
Poll download progress.

```json
{
  "download_id": "550e8400-...",
  "status": "downloading",
  "progress": 45.5,
  "downloaded_formatted": "202.50 MB",
  "total_formatted": "450.00 MB",
  "speed_formatted": "5.00 MB/s",
  "eta": 49
}
```

When completed:
```json
{
  "status": "completed",
  "progress": 100,
  "download_url": "/api/download/file/550e8400-.../video_1080p.mp4",
  "filename": "video_1080p.mp4",
  "filesize_formatted": "450.00 MB"
}
```

---

### GET /api/download/file/:id/:filename
Download the actual file. Supports HTTP Range (resumable).

---

### GET /api/preview?url=
Get preview metadata for any URL.

**Query params:** `url`, `type`, `width`, `height`, `quality`

---

### GET /api/preview/thumbnail?url=
Proxy and resize a thumbnail image. Returns JPEG directly.

---

### GET /api/proxy?url=
CORS bypass proxy. Streams any public media URL with CORS headers.

Supports `Range` header for video seeking.

---

### GET /api/stats
Public download statistics.

---

### GET /health
Health check. Returns detailed system info with admin API key.

---

## Admin Endpoints
All require `X-API-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/cookies | List all cookies |
| POST | /api/admin/cookies/upload | Upload cookie file (multipart or JSON) |
| DELETE | /api/admin/cookies/:id | Delete single cookie |
| DELETE | /api/admin/cookies | Bulk delete cookies |
| GET | /api/admin/keys | List API keys |
| POST | /api/admin/keys/create | Create API key |
| DELETE | /api/admin/keys/:id | Delete API key |
| GET | /api/admin/backup | List backups |
| POST | /api/admin/backup/create | Create backup |
| GET | /api/admin/backup/download/:id | Download backup |
| GET | /api/admin/logs | View recent logs |
| POST | /api/admin/system/update-ytdlp | Trigger yt-dlp update |
| POST | /api/admin/system/cleanup | Trigger temp file cleanup |

---

## Cookie Upload

**Multipart:**
```bash
curl -X POST http://localhost:3002/api/admin/cookies/upload \
  -H "X-API-Key: maimbro@#097" \
  -F "platform=youtube" \
  -F "account_name=main" \
  -F "priority=1" \
  -F "cookie_file=@/path/to/cookies.txt"
```

**JSON:**
```bash
curl -X POST http://localhost:3002/api/admin/cookies/upload \
  -H "X-API-Key: maimbro@#097" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "instagram",
    "account_name": "main",
    "priority": 1,
    "cookies": "# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\t..."
  }'
```

Cookie files must be in **Netscape format** (exported from browser extensions like "Get cookies.txt LOCALLY").

---

## WebSocket Progress
Connect to `ws://localhost:3002/ws` for real-time download progress.

```javascript
const ws = new WebSocket('ws://localhost:3002/ws');
ws.onopen = () => ws.send(JSON.stringify({ downloadId: '550e8400-...' }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## Environment Variables
See `.env.example` for full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | `maimbro@#097` | Master API key |
| `DATA_PATH` | `/data` | Root data directory |
| `MAX_CONCURRENT_DOWNLOADS` | `5` | Parallel downloads |
| `TEMP_RETENTION_HOURS` | `1` | Auto-delete temp files after N hours |
| `CACHE_TTL_HOURS` | `24` | Cache TTL |
| `COOKIE_ROTATION_STRATEGY` | `weighted` | `weighted`, `round-robin`, `random`, `least-used` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per minute |
| `RATE_LIMIT_MAX_DOWNLOADS` | `20` | Downloads per minute |

---

## Project Structure

```
src/
├── app.js                    Express app setup
├── server.js                 Entry point + WebSocket server
├── config/
│   ├── constants.js          App-wide constants
│   └── platforms.js          Platform URL patterns & user agents
├── routes/                   Express routers
├── controllers/              Request handlers
├── services/
│   ├── downloader.js         yt-dlp wrapper
│   ├── downloadManager.js    Queue + progress tracking
│   ├── cookieManager.js      Cookie CRUD + rotation
│   ├── cacheManager.js       Memory + disk cache
│   ├── platformDetector.js   URL → platform + media type
│   ├── proxyService.js       CORS bypass proxy
│   └── thumbnailService.js   FFmpeg thumbnail generation
├── middleware/               auth, rateLimit, validation, errorHandler
├── utils/                    db, logger, helpers
└── jobs/                     cron: cleanup, cache, cookies, ytdlp, backup
```
