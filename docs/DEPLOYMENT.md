# Deployment Guide

## Fly.io (Recommended)

### 1. Prerequisites
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Authenticate
flyctl auth login
```

### 2. Launch App
```bash
flyctl launch
# Answer prompts:
#   App name: social-media-downloader-api
#   Region: sin (Singapore) or nearest
#   Postgres: No
#   Redis: No
```

### 3. Create Persistent Volume
```bash
flyctl volumes create data --size 10 --region sin
```

### 4. Set Secrets
```bash
flyctl secrets set \
  API_KEY="your-strong-secret-key" \
  NODE_ENV="production"
```

### 5. Deploy
```bash
flyctl deploy
```

### 6. Scale (Optional)
```bash
# Increase memory for heavy workloads
flyctl scale memory 2048

# Multiple instances
flyctl scale count 2
```

### 7. Verify
```bash
# Check status
flyctl status

# View logs
flyctl logs

# Open app
flyctl open /health
```

### Volume Management
```bash
# List volumes
flyctl volumes list

# Extend if needed
flyctl volumes extend vol_xxxxx --size 20

# SSH into machine
flyctl ssh console
```

---

## Docker (Self-hosted)

### Single Container
```bash
docker build -t social-media-downloader-api .

docker run -d \
  --name smda \
  -p 3002:3002 \
  -v $(pwd)/data:/data \
  -e API_KEY=your-secret-key \
  -e NODE_ENV=production \
  social-media-downloader-api
```

### Docker Compose
```bash
docker-compose up -d

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Update
docker-compose pull && docker-compose up -d
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | ✅ | `maimbro@#097` | Master admin key — **change this!** |
| `PORT` | | `3002` | HTTP port |
| `NODE_ENV` | | `development` | `production` enables optimizations |
| `DATA_PATH` | | `/data` | Root for all persistent data |
| `MAX_CONCURRENT_DOWNLOADS` | | `5` | Parallel yt-dlp processes |
| `TEMP_RETENTION_HOURS` | | `1` | Delete temp files after N hours |
| `CACHE_TTL_HOURS` | | `24` | Metadata cache TTL |
| `MAX_CACHE_SIZE_MB` | | `500` | Max disk cache size |
| `COOKIE_ROTATION_STRATEGY` | | `weighted` | Cookie selection algorithm |
| `COOKIE_FAIL_THRESHOLD` | | `5` | Disable cookie after N consecutive fails |
| `RATE_LIMIT_MAX_REQUESTS` | | `100` | Requests per minute per IP |
| `RATE_LIMIT_MAX_DOWNLOADS` | | `20` | Downloads per minute per IP |
| `ENABLE_RATE_LIMITING` | | `true` | Toggle rate limiting |
| `LOG_LEVEL` | | `info` | `debug`, `info`, `warn`, `error` |
| `BACKUP_SCHEDULE` | | `0 2 * * *` | Cron: daily at 2am |
| `BACKUP_RETENTION_DAYS` | | `7` | Keep N days of backups |

---

## Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Large file support
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        client_max_body_size 50M;
    }
}
```

---

## Post-Deploy Checklist

- [ ] Change `API_KEY` from default
- [ ] Verify `/health` returns `"status": "OK"`
- [ ] Upload at least one cookie per platform you need
- [ ] Test a download end-to-end
- [ ] Confirm `/data` volume is mounted and persistent
- [ ] Check logs: `flyctl logs` or `docker-compose logs`
- [ ] Set up external monitoring (UptimeRobot, etc.) on `/health`
