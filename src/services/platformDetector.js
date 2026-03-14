const { PLATFORMS } = require('../config/platforms');
const { isValidUrl } = require('../utils/helpers');

function detectPlatform(url) {
  if (!isValidUrl(url)) return null;

  for (const [key, platform] of Object.entries(PLATFORMS)) {
    for (const pattern of platform.patterns) {
      if (pattern.test(url)) {
        return key;
      }
    }
  }
  return null;
}

function getPlatformInfo(url) {
  const platform = detectPlatform(url);
  if (!platform) return null;
  return { platform, ...PLATFORMS[platform] };
}

function detectMediaType(info) {
  if (!info) return 'video';

  const url = info.webpage_url || info.url || '';

  // Playlist detection
  if (info._type === 'playlist' || info.entries) return 'playlist';

  // Story detection
  if (url.includes('/stories/')) return 'story';

  // Live stream
  if (info.is_live) return 'live';

  // Audio only
  if (!info.vcodec || info.vcodec === 'none') return 'audio';

  // Carousel / Gallery
  if (
    (info.requested_downloads && info.requested_downloads.length > 1) ||
    url.includes('/gallery/') ||
    info._type === 'multi_video'
  ) return 'carousel';

  // Photo / Image
  const ext = (info.ext || '').toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'bmp'];
  if (imageExts.includes(ext)) {
    if (ext === 'gif') return 'gif';
    return 'photo';
  }

  // Default to video
  return 'video';
}

function formatMediaInfo(rawInfo) {
  if (!rawInfo) return null;

  const duration = rawInfo.duration || 0;

  return {
    title: rawInfo.title || rawInfo.fulltitle || 'Untitled',
    description: rawInfo.description || rawInfo.caption || null,
    duration,
    duration_formatted: formatDuration(duration),
    uploader: rawInfo.uploader || rawInfo.channel || rawInfo.creator || rawInfo.artist || null,
    uploader_id: rawInfo.uploader_id || rawInfo.channel_id || null,
    uploader_url: rawInfo.uploader_url || rawInfo.channel_url || null,
    upload_date: formatDate(rawInfo.upload_date),
    view_count: rawInfo.view_count || null,
    like_count: rawInfo.like_count || null,
    comment_count: rawInfo.comment_count || null,
    share_count: rawInfo.repost_count || null,
    thumbnail: rawInfo.thumbnail || (rawInfo.thumbnails?.[0]?.url) || null,
    thumbnails: (rawInfo.thumbnails || []).map(t => ({
      url: t.url,
      width: t.width,
      height: t.height,
    })).filter(t => t.url),
    age_restricted: rawInfo.age_limit > 0,
    is_live: rawInfo.is_live || false,
    was_live: rawInfo.was_live || false,
    categories: rawInfo.categories || [],
    tags: rawInfo.tags || [],
  };
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  // yt-dlp returns YYYYMMDD
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
  }
  return dateStr;
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function normalizeFormats(rawFormats = []) {
  const formats = rawFormats.map(f => {
    const hasVideo = f.vcodec && f.vcodec !== 'none';
    const hasAudio = f.acodec && f.acodec !== 'none';
    let type = 'unknown';
    if (hasVideo && hasAudio) type = 'video+audio';
    else if (hasVideo) type = 'video-only';
    else if (hasAudio) type = 'audio-only';

    const filesize = f.filesize || f.filesize_approx || estimateFilesize(f);

    return {
      format_id: f.format_id,
      format_note: f.format_note || f.quality || null,
      ext: f.ext,
      width: f.width || null,
      height: f.height || null,
      fps: f.fps || null,
      vcodec: hasVideo ? f.vcodec : null,
      acodec: hasAudio ? f.acodec : null,
      filesize,
      filesize_formatted: formatBytes(filesize),
      tbr: f.tbr || null,
      vbr: f.vbr || null,
      abr: f.abr || null,
      format: buildFormatLabel(f, type),
      type,
      resolution: f.width && f.height ? `${f.width}x${f.height}` : null,
    };
  });

  // Sort: video+audio by height desc, then video-only, then audio-only by abr desc
  return formats.sort((a, b) => {
    const typeOrder = { 'video+audio': 0, 'video-only': 1, 'audio-only': 2, 'unknown': 3 };
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    if (a.type.includes('video')) return (b.height || 0) - (a.height || 0);
    return (b.abr || 0) - (a.abr || 0);
  });
}

function buildFormatLabel(f, type) {
  if (type === 'audio-only') {
    const codec = f.acodec || f.ext || 'audio';
    const bitrate = f.abr ? `${Math.round(f.abr)}kbps` : '';
    return `Audio ${codec.toUpperCase()} ${bitrate}`.trim();
  }
  const res = f.height ? `${f.height}p` : (f.format_note || 'video');
  const codec = f.vcodec ? `${f.vcodec}/${f.acodec || 'none'}` : '';
  const ext = f.ext ? f.ext.toUpperCase() : '';
  return `${res} ${ext} (${codec})`.trim();
}

function estimateFilesize(format) {
  if (!format.tbr || !format.duration) return null;
  return Math.floor((format.tbr * 1000 / 8) * format.duration);
}

function formatBytes(bytes) {
  if (!bytes) return null;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

module.exports = {
  detectPlatform,
  getPlatformInfo,
  detectMediaType,
  formatMediaInfo,
  normalizeFormats,
  formatDuration,
  formatDate,
};
