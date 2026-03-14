const { extractInfo } = require('../services/downloader');
const { detectPlatform, detectMediaType, formatMediaInfo, normalizeFormats } = require('../services/platformDetector');
const { generateKey, getCached, setCache } = require('../services/cacheManager');
const { APIError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

async function extract(req, res, next) {
  const {
    url,
    include_all_formats = true,
    include_subtitles = true,
    include_thumbnails = true,
  } = req.body;

  try {
    const platform = detectPlatform(url);
    if (!platform) {
      return next(new APIError('Unsupported platform or unrecognized URL', ERROR_CODES.UNSUPPORTED_PLATFORM, 400));
    }

    // Check cache
    const cacheKey = generateKey(url, { type: 'extract' });
    const cached = getCached(cacheKey, 'metadata');
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    logger.info(`Extracting info: ${url} [${platform}]`);

    const { info, allInfos } = await extractInfo(url, {
      includeFormats: include_all_formats,
      includeSubtitles: include_subtitles,
    });

    if (!info) {
      return next(new APIError('Could not extract media information', ERROR_CODES.MEDIA_NOT_FOUND, 404));
    }

    const mediaType = detectMediaType(info);
    const mediaInfo = formatMediaInfo(info);
    const formats = include_all_formats ? normalizeFormats(info.formats || []) : [];

    // Build subtitles list
    let subtitles = [];
    if (include_subtitles && info.subtitles) {
      subtitles = Object.entries(info.subtitles).map(([lang, subs]) => ({
        language: lang,
        name: subs[0]?.name || lang,
        formats: subs.map(s => s.ext),
      }));
    }

    // Build thumbnail list
    let thumbnails = [];
    if (include_thumbnails && info.thumbnails) {
      thumbnails = info.thumbnails
        .filter(t => t.url)
        .map(t => ({ url: t.url, width: t.width, height: t.height }))
        .sort((a, b) => (b.width || 0) - (a.width || 0));
    }

    // Handle playlist/carousel
    let items = null;
    let totalItems = null;
    if (mediaType === 'playlist' && allInfos.length > 1) {
      totalItems = allInfos.length;
      items = allInfos.slice(0, 50).map((item, i) => ({
        index: i + 1,
        title: item.title,
        duration: item.duration,
        url: item.webpage_url || item.url,
        thumbnail: item.thumbnail,
      }));
    }

    const response = {
      success: true,
      platform,
      media_type: mediaType,
      url,
      ...mediaInfo,
      subtitles,
      thumbnails,
      formats,
      total_items: totalItems,
      items,
      requested_formats: info.requested_formats?.map(f => ({
        format_id: f.format_id,
        format: f.format_note || f.format,
        ext: f.ext,
        filesize: f.filesize || f.filesize_approx,
      })) || [],
    };

    // Cache it
    setCache(cacheKey, response, 'metadata', url);

    res.json(response);
  } catch (error) {
    logger.error(`Extract failed for ${url}:`, error.message);
    if (error.message.includes('timed out')) {
      return next(new APIError('Request timed out', ERROR_CODES.TIMEOUT, 504));
    }
    next(new APIError(error.message || 'Failed to extract media info', ERROR_CODES.MEDIA_NOT_FOUND, 500));
  }
}

async function getFormats(req, res, next) {
  const { url } = req.body;

  try {
    const platform = detectPlatform(url);
    if (!platform) {
      return next(new APIError('Unsupported platform', ERROR_CODES.UNSUPPORTED_PLATFORM, 400));
    }

    const cacheKey = generateKey(url, { type: 'formats' });
    const cached = getCached(cacheKey, 'formats');
    if (cached) return res.json({ ...cached, cached: true });

    const { info } = await extractInfo(url, { includeFormats: true });

    const formats = normalizeFormats(info.formats || []);
    const subtitles = info.subtitles
      ? Object.entries(info.subtitles).map(([lang, subs]) => ({
          language: lang,
          name: subs[0]?.name || lang,
        }))
      : [];

    const thumbnails = (info.thumbnails || [])
      .filter(t => t.url)
      .map(t => ({ url: t.url, width: t.width, height: t.height }));

    const response = {
      success: true,
      url,
      platform,
      title: info.title,
      formats,
      subtitles,
      thumbnails,
    };

    setCache(cacheKey, response, 'formats', url);
    res.json(response);
  } catch (error) {
    next(new APIError(error.message, ERROR_CODES.MEDIA_NOT_FOUND, 500));
  }
}

module.exports = { extract, getFormats };
