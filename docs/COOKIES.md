# Cookie Management Guide

## Why Cookies?

Some platforms (Instagram, Facebook, LinkedIn, age-restricted YouTube) require authenticated sessions to download content. Cookies carry your browser session to yt-dlp.

## Getting Cookies

### Browser Extension (Recommended)
1. Install **"Get cookies.txt LOCALLY"** for [Chrome](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) or [Firefox](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)
2. Log into the platform (Instagram, YouTube, etc.)
3. Click the extension → **Export** → Save as `platform_account.txt`
4. Upload via API

### Cookie File Format (Netscape)
```
# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
.instagram.com	TRUE	/	FALSE	1735689600	sessionid	123456%3Aabcdef...
.instagram.com	TRUE	/	FALSE	1735689600	csrftoken	abcdef123456
.youtube.com	TRUE	/	FALSE	1735689600	LOGIN_INFO	AFmmF2swRQI...
.youtube.com	TRUE	/	TRUE	1735689600	__Secure-3PSID	...
```

**Columns:** domain, include_subdomains, path, is_secure, expiry_unix, name, value

---

## Uploading Cookies

### Via File Upload (curl)
```bash
curl -X POST https://your-api.fly.dev/api/admin/cookies/upload \
  -H "X-API-Key: your-api-key" \
  -F "platform=instagram" \
  -F "account_name=main" \
  -F "priority=1" \
  -F "cookie_file=@instagram_main.txt"
```

### Via JSON
```bash
curl -X POST https://your-api.fly.dev/api/admin/cookies/upload \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "instagram",
    "account_name": "main",
    "priority": 1,
    "cookies": "# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tFALSE\t1735689600\tsessionid\t123..."
  }'
```

---

## Priority Levels

| Priority | Use |
|----------|-----|
| 1 | Primary account (most downloads) |
| 2 | Secondary / backup |
| 3 | Tertiary |
| 4 | Low-use fallback |
| 5 | Last resort |

The system always tries priority 1 first. On failure, falls back to 2, 3, etc.

---

## Rotation Strategies

Set via `COOKIE_ROTATION_STRATEGY` env var:

| Strategy | Description | Best For |
|----------|-------------|----------|
| `weighted` | Favors cookies with higher success rate | Production (default) |
| `round-robin` | Takes turns evenly | Even load distribution |
| `least-used` | Always picks lowest usage count | Fresh cookie preservation |
| `random` | Random selection | Simple setups |

---

## Cookie Health & Auto-Disable

The system automatically:
- **Checks expiry** every hour — marks as `expired` if past expiry timestamp
- **Tracks failures** — after `COOKIE_FAIL_THRESHOLD` consecutive failures, marks `disabled`
- **Logs usage** — every success/failure recorded in `cookie_logs` table

### Cookie Statuses
| Status | Meaning |
|--------|---------|
| `active` | In use, healthy |
| `expired` | Past expiry date |
| `invalid` | Failed validation |
| `disabled` | Auto-disabled due to failures |

### View Cookie Stats
```bash
curl https://your-api.fly.dev/api/admin/cookies \
  -H "X-API-Key: your-api-key"
```

### Re-enable a Disabled Cookie
Upload a fresh cookie file with the same `platform` + `account_name` — it will be re-activated.

---

## Platform-Specific Notes

### YouTube
- Cookies needed for: age-restricted videos, private videos, members-only
- Key cookies: `LOGIN_INFO`, `__Secure-3PSID`, `SAPISID`, `SID`
- Refresh every: 30 days

### Instagram
- Cookies needed for: all private content, stories, some reels
- Key cookies: `sessionid`, `csrftoken`, `ds_user_id`
- Refresh every: 14–30 days

### Facebook
- Cookies needed for: private videos, stories
- Key cookies: `c_user`, `xs`, `datr`
- Refresh every: 30–90 days

### TikTok
- Usually works without cookies
- Cookies may help: `tt_webid`, `sessionid`

### LinkedIn
- Cookies needed for all content
- Key cookies: `li_at`, `JSESSIONID`
- Refresh every: 1 year

---

## Multiple Accounts Per Platform

You can upload multiple accounts per platform:

```bash
# Main account (priority 1)
curl ... -F "platform=youtube" -F "account_name=main" -F "priority=1" -F "cookie_file=@yt_main.txt"

# Backup account (priority 2)
curl ... -F "platform=youtube" -F "account_name=backup1" -F "priority=2" -F "cookie_file=@yt_backup1.txt"
```

The system rotates between them based on the strategy configured.
