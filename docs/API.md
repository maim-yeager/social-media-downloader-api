# API Documentation

## Base URL
```
https://your-app.fly.dev
```

## Authentication
Admin endpoints require `X-API-Key` header or `?api_key=` query parameter.

```
X-API-Key: maimbro@#097
```

---

## Endpoints

### `GET /health`
Basic health check. Returns detailed info with admin key.

**Public response:**
```json
{ "status": "OK", "timestamp": "2024-01-15T12:00:00Z", "version": "1.0.0", "uptime": 3600 }
```

**Admin response (with X-API-Key):**
```json
{
  "status": "OK",
  "services": {
    "database": "connected",
    "yt-dlp": "available (2024.01.15)",
    "ffmpeg": "available (6.0)",
    "disk_space": { "total": "100 GB", "free": "55 GB", "usage_percent": 45 },
    "memory": { "total": "4 GB", "used": "2.5 GB", "usage_percent": 62 },
    "downloads": { "active": 2, "queued": 0, "completed_today": 45 },
    "cookies": { "total": 8, "active": 6, "expired": 1, "disabled": 1 }
  }
}
```

---

### `POST /api/extract`
Extract full media info, formats, subtitles, thumbnails.

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=VIDEO_ID",
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
  "description": "...",
  "duration": 212,
  "duration_formatted": "3:32",
  "uploader": "Channel Name",
  "uploader_id": "@channel",
  "uploader_url": "https://youtube.com/@channel",
  "upload_date": "2024-01-15",
  "view_count": 1500000,
  "like_count": 120000,
  "thumbnail": "https://img.youtube.com/vi/xxx/maxresdefault.jpg",
  "thumbnails": [{ "url": "...", "width": 1280, "height": 720 }],
  "age_restricted": false,
  "is_live": false,
  "categories": ["Music"],
  "tags": ["tag1"],
  "subtitles": [{ "language": "en", "name": "English", "formats": ["vtt", "srv3"] }],
  "formats": [
    {
      "format_id": "137+140",
      "format_note": "1080p",
      "ext": "mp4",
      "width": 1920, "height": 1080, "fps": 30,
      "vcodec": "h264", "acodec": "m4a",
      "filesize": 450000000,
      "filesize_formatted": "450.00 MB",
      "format": "1080p MP4 (h264/m4a)",
      "type": "video+audio"
    },
    {
      "format_id": "140",
      "format_note": "audio only",
      "ext": "m4a",
      "acodec": "m4a",
      "abr": 128,
      "filesize": 15000000,
      "filesize_formatted": "15.00 MB",
      "format": "Audio M4A 128kbps",
      "type": "audio-only"
    }
  ]
}
```

---

### `POST /api/extract/formats`
Get only format list (faster than full extract).

**Request:**
```json
{ "url": "https://youtube.com/watch?v=VIDEO_ID" }
```

---

### `POST /api/download`
Start a media download. Returns immediately with a `download_id`.

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=VIDEO_ID",
  "format_id": "137+140",
  "quality": "1080p",
  "type": "video",
  "ext": "mp4",
  "subtitles": ["en", "es"],
  "embed_metadata": true,
  "webhook_url": "https://yourapp.com/done"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | **Required.** Media URL |
| `format_id` | string | yt-dlp format ID (e.g. `137+140`) |
| `quality` | string | `best`, `4k`, `1080p`, `720p`, `480p`, `360p`, `240p`, `144p` |
| `type` | string | `video`, `audio`, `photo`, `auto` (default: `auto`) |
| `ext` | string | `mp4`, `webm`, `mp3`, `m4a`, `flac`, `wav`, `jpg`, `png` |
| `subtitles` | array | Language codes: `["en", "es"]` |
| `embed_metadata` | bool | Embed title/artist tags (default: `true`) |
| `webhook_url` | string | POST callback when done |

**Response (downloading):**
```json
{
  "success": true,
  "download_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "downloading",
  "progress_url": "/api/download/550e8400-.../progress",
  "platform": "youtube",
  "media_type": "video"
}
```

**Response (queued):**
```json
{
  "success": true,
  "download_id": "550e8400-...",
  "status": "queued",
  "position": 3,
  "estimated_wait": 90,
  "progress_url": "/api/download/550e8400-.../progress"
}
```

---

### `GET /api/download/:id/progress`
Poll download progress.

```json
{
  "download_id": "550e8400-...",
  "status": "downloading",
  "progress": 67.3,
  "downloaded_formatted": "302.85 MB",
  "total_formatted": "450.00 MB",
  "speed_formatted": "8.50 MB/s",
  "eta": 17,
  "eta_formatted": "17s",
  "started_at": "2024-01-15T10:30:00Z"
}
```

**Status values:** `queued` → `downloading` → `completed` | `failed`

When `status === "completed"`:
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

### `GET /api/download/file/:id/:filename`
Stream the downloaded file. Supports HTTP Range for seeking/resumable downloads.

```
Content-Disposition: attachment; filename="video_1080p.mp4"
Accept-Ranges: bytes
```

---

### `GET /api/preview?url=URL`
Get preview metadata for any supported URL.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `url` | — | **Required** |
| `type` | `auto` | `video`, `image`, `carousel`, `audio` |
| `width` | `1280` | Max width for images |
| `height` | `720` | Max height |
| `quality` | `80` | JPEG quality (1–100) |

---

### `GET /api/preview/thumbnail?url=URL`
Proxy, resize and return thumbnail as JPEG.

---

### `GET /api/proxy?url=URL`
CORS bypass proxy. Streams remote URL with full CORS headers.

Supports: `Range` header, `Content-Type` forwarding, chunked transfer.

Blocked: private IPs (127.x, 10.x, 192.168.x, ::1)

---

### `GET /api/stats`
Public statistics. Returns detailed stats with admin key.

---

## Admin Endpoints

All require `X-API-Key` header.

### Cookies

#### `GET /api/admin/cookies`
```
?platform=youtube&status=active&limit=50&offset=0
```

#### `POST /api/admin/cookies/upload`
Multipart form:
```
platform: youtube
account_name: main
priority: 1
cookie_file: [binary .txt]
```

Or JSON:
```json
{
  "platform": "youtube",
  "account_name": "main",
  "priority": 1,
  "cookies": "# Netscape HTTP Cookie File\n..."
}
```

#### `DELETE /api/admin/cookies/:id`
Delete single cookie by ID.

#### `DELETE /api/admin/cookies`
Bulk delete:
```json
{ "platform": "youtube", "status": "expired" }
```

### API Keys

#### `POST /api/admin/keys/create`
```json
{
  "name": "My App",
  "permissions": ["read", "write"],
  "expires_at": "2025-12-31T00:00:00Z",
  "rate_limit": 1000
}
```
Returns the key once — store it securely.

#### `GET /api/admin/keys`
#### `DELETE /api/admin/keys/:id`

### Backups

#### `POST /api/admin/backup/create`
```json
{ "include_database": true, "include_cookies": true }
```

#### `GET /api/admin/backup`
#### `GET /api/admin/backup/download/:id`

### System

#### `GET /api/admin/logs?level=info&lines=100`
#### `POST /api/admin/system/update-ytdlp`
#### `POST /api/admin/system/cleanup`

---

## WebSocket

Connect to `ws://host/ws` for real-time progress.

```javascript
const ws = new WebSocket('wss://your-app.fly.dev/ws');

// Subscribe to a specific download
ws.onopen = () => {
  ws.send(JSON.stringify({ downloadId: '550e8400-...' }));
};

// Receive updates
ws.onmessage = ({ data }) => {
  const update = JSON.parse(data);
  console.log(update.progress, update.status);
};
```

Message format:
```json
{
  "type": "progress",
  "downloadId": "550e8400-...",
  "status": "downloading",
  "progress": 45.5,
  "speed": 8912345,
  "eta": 22
}
```

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Invalid URL format"
  },
  "request_id": "req_abc123"
}
```

**Error codes:**
| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_URL` | 400 | URL missing or malformed |
| `UNSUPPORTED_PLATFORM` | 400 | Platform not recognized |
| `MEDIA_NOT_FOUND` | 404 | Content unavailable/private |
| `DOWNLOAD_FAILED` | 500 | yt-dlp download error |
| `COOKIE_REQUIRED` | 400 | Login required for this content |
| `ALL_COOKIES_FAILED` | 500 | All accounts failed |
| `RATE_LIMITED` | 429 | Too many requests |
| `FILE_TOO_LARGE` | 400 | Exceeds MAX_FILE_SIZE |
| `INVALID_FORMAT` | 400 | Unknown format/ext/quality |
| `AUTH_REQUIRED` | 401 | Missing or invalid API key |
| `TIMEOUT` | 504 | Request timed out |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
