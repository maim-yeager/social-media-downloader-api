const path = require('path');
const fs = require('fs');

const { extractInfo } = require('../services/downloader');
const { detectPlatform, detectMediaType } = require('../services/platformDetector');
const { generateKey, getCached, setCache } = require('../services/cacheManager');
const { corsProxyMiddleware } = require('../services/proxyService');
const { generateVideoThumbnail, getThumbnailFromUrl } = require('../services/thumbnailService');
const { APIError } = require('../middleware/errorHandler');
const { CACHE_PATH } = require('../config/constants');
const logger = require('../utils/logger');

async function getPreview(req, res, next) {
  // Support both GET ?url= and POST { url }
  const url = req.query.url || req.body?.url;
  if (!url) return next(new APIError('url parameter is required', 'INVALID_URL', 400));

  try {
    const platform = detectPlatform(url);
    if (!platform) {
      return next(new APIError('Unsupported platform or unrecognized URL', 'UNSUPPORTED_PLATFORM', 400));
    }

    const cacheKey = generateKey(url, { type: 'preview' });
    const cached = getCached(cacheKey, 'metadata');
    if (cached) return res.json({ ...cached, cached: true });

    const { info } = await extractInfo(url, {});
    const mediaType = detectMediaType(info);

    let previewData;

    if (mediaType === 'video' || mediaType === 'reel' || mediaType === 'live' || mediaType === 'story' || mediaType === 'gif') {
      // Use webpage_url for preview to avoid using raw CDN stream URLs that expire quickly
      const previewSrc = info.webpage_url || url;
      previewData = {
        type: 'video',
        preview_url: `/api/proxy?url=${encodeURIComponent(previewSrc)}`,
        // Proxy the thumbnail so CORS isn't an issue on the client
        thumbnail: info.thumbnail
          ? `/api/proxy?url=${encodeURIComponent(info.thumbnail)}`
          : null,
        duration: info.duration || null,
        width: info.width || info.requested_formats?.[0]?.width || 640,
        height: info.height || info.requested_formats?.[0]?.height || 360,
        title: info.title || null,
        uploader: info.uploader || info.channel || null,
        expires_in: 3600,
      };
    } else if (mediaType === 'audio') {
      previewData = {
        type: 'audio',
        preview_url: info.url ? `/api/proxy?url=${encodeURIComponent(info.url)}` : null,
        thumbnail: info.thumbnail
          ? `/api/proxy?url=${encodeURIComponent(info.thumbnail)}`
          : null,
        duration: info.duration || null,
        title: info.title || null,
        uploader: info.uploader || info.artist || null,
        expires_in: 3600,
      };
    } else if (mediaType === 'photo') {
      // For images, info.url is the direct image URL
      const imgUrl = info.url || info.thumbnail;
      previewData = {
        type: 'image',
        preview_url: imgUrl ? `/api/proxy?url=${encodeURIComponent(imgUrl)}` : null,
        thumbnail: info.thumbnail ? `/api/proxy?url=${encodeURIComponent(info.thumbnail)}` : null,
        width: info.width || null,
        height: info.height || null,
        format: info.ext || 'jpeg',
        expires_in: 3600,
      };
    } else if (mediaType === 'carousel') {
      // Instagram carousel / gallery
      const entries = info.entries || info.requested_downloads || [];
      const items = entries.map((item, i) => {
        const isVideo = item.vcodec && item.vcodec !== 'none';
        return {
          index: i + 1,
          type: isVideo ? 'video' : 'image',
          preview_url: item.url ? `/api/proxy?url=${encodeURIComponent(item.url)}` : null,
          thumbnail: item.thumbnail ? `/api/proxy?url=${encodeURIComponent(item.thumbnail)}` : null,
          duration: item.duration || null,
          width: item.width || null,
          height: item.height || null,
        };
      });
      previewData = {
        type: 'carousel',
        total_items: items.length,
        items,
        thumbnail: info.thumbnail ? `/api/proxy?url=${encodeURIComponent(info.thumbnail)}` : null,
        expires_in: 3600,
      };
    } else {
      // Fallback
      previewData = {
        type: mediaType,
        thumbnail: info.thumbnail
          ? `/api/proxy?url=${encodeURIComponent(info.thumbnail)}`
          : null,
        title: info.title || null,
        expires_in: 3600,
      };
    }

    // Add common metadata
    previewData.platform = platform;
    previewData.media_type = mediaType;
    previewData.url = url;

    setCache(cacheKey, previewData, 'metadata', url);
    res.json(previewData);

  } catch (error) {
    logger.warn(`Preview failed for ${url}: ${error.message}`);
    next(new APIError(error.message || 'Failed to generate preview', 'PREVIEW_FAILED', 500));
  }
}

async function getThumbnail(req, res, next) {
  const url = req.query.url;
  if (!url) return next(new APIError('url parameter is required', 'INVALID_URL', 400));

  const width = Math.min(parseInt(req.query.width) || 640, 1920);
  const height = Math.min(parseInt(req.query.height) || 360, 1080);
  const quality = Math.min(Math.max(parseInt(req.query.quality) || 80, 1), 100);

  const cacheKey = generateKey(url, { type: 'thumbnail', width, height });
  const thumbDir = path.join(CACHE_PATH, 'thumbnails');
  const thumbPath = path.join(thumbDir, `${cacheKey}.jpg`);

  // Serve from cache if available
  if (fs.existsSync(thumbPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const stream = fs.createReadStream(thumbPath);
    stream.on('error', () => res.status(500).end());
    return stream.pipe(res);
  }

  try {
    // Ensure thumbnail dir exists
    fs.mkdirSync(thumbDir, { recursive: true });

    const downloaded = await getThumbnailFromUrl(url, thumbPath);
    if (!downloaded || !fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    // Resize with sharp if available, silently skip on error
    try {
      const sharp = require('sharp');
      const resized = thumbPath.replace('.jpg', '_r.jpg');
      await sharp(thumbPath)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toFile(resized);
      fs.renameSync(resized, thumbPath);
    } catch {
      // sharp not available or resize failed – serve original
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const stream = fs.createReadStream(thumbPath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);

  } catch (error) {
    logger.debug(`Thumbnail error for ${url}: ${error.message}`);
    next(new APIError('Failed to get thumbnail', 'THUMBNAIL_FAILED', 500));
  }
}

// Re-export proxy middleware
const proxy = corsProxyMiddleware;

module.exports = { getPreview, getThumbnail, proxy };
