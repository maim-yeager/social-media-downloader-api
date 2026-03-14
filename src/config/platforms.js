const PLATFORMS = {
  youtube: {
    name: 'YouTube',
    patterns: [
      /youtube\.com\/watch/,
      /youtu\.be\//,
      /youtube\.com\/shorts\//,
      /youtube\.com\/playlist/,
      /youtube\.com\/live\//,
      /youtube\.com\/embed\//,
      /m\.youtube\.com/,
    ],
    supportedTypes: ['video', 'playlist', 'live', 'audio'],
    requiresCookies: false,
    supportsAudio: true,
  },
  tiktok: {
    name: 'TikTok',
    patterns: [
      /tiktok\.com\/@/,
      /tiktok\.com\/v\//,
      /vt\.tiktok\.com\//,
      /vm\.tiktok\.com\//,
      /tiktok\.com\/t\//,
    ],
    supportedTypes: ['video', 'photo', 'carousel', 'audio'],
    requiresCookies: false,
    supportsAudio: true,
  },
  instagram: {
    name: 'Instagram',
    patterns: [
      /instagram\.com\/reel\//,
      /instagram\.com\/p\//,
      /instagram\.com\/tv\//,
      /instagram\.com\/stories\//,
      /instagram\.com\/reels\//,
    ],
    supportedTypes: ['video', 'photo', 'carousel', 'story', 'reel'],
    requiresCookies: true,
    supportsAudio: true,
  },
  facebook: {
    name: 'Facebook',
    patterns: [
      /facebook\.com\/.*\/videos\//,
      /facebook\.com\/watch/,
      /facebook\.com\/reel/,
      /facebook\.com\/stories/,
      /fb\.watch\//,
      /facebook\.com\/share\/v\//,
      /facebook\.com\/share\/r\//,
    ],
    supportedTypes: ['video', 'photo', 'reel', 'story'],
    requiresCookies: true,
    supportsAudio: true,
  },
  twitter: {
    name: 'Twitter/X',
    patterns: [
      /twitter\.com\/.*\/status\//,
      /x\.com\/.*\/status\//,
      /t\.co\//,
    ],
    supportedTypes: ['video', 'photo', 'gif'],
    requiresCookies: false,
    supportsAudio: false,
  },
  pinterest: {
    name: 'Pinterest',
    patterns: [
      /pinterest\.com\/pin\//,
      /pin\.it\//,
      /pinterest\.[a-z]+\/pin\//,
    ],
    supportedTypes: ['photo', 'video'],
    requiresCookies: false,
    supportsAudio: false,
  },
  reddit: {
    name: 'Reddit',
    patterns: [
      /reddit\.com\/r\/.*\/comments\//,
      /redd\.it\//,
      /reddit\.com\/gallery\//,
    ],
    supportedTypes: ['video', 'photo', 'gallery', 'gif'],
    requiresCookies: false,
    supportsAudio: false,
  },
  linkedin: {
    name: 'LinkedIn',
    patterns: [
      /linkedin\.com\/feed\/update\//,
      /linkedin\.com\/posts\//,
    ],
    supportedTypes: ['video', 'photo'],
    requiresCookies: true,
    supportsAudio: false,
  },
  telegram: {
    name: 'Telegram',
    patterns: [
      /t\.me\//,
      /telegram\.me\//,
    ],
    supportedTypes: ['video', 'photo', 'audio'],
    requiresCookies: false,
    supportsAudio: true,
  },
  vimeo: {
    name: 'Vimeo',
    patterns: [
      /vimeo\.com\/\d+/,
      /vimeo\.com\/channels\//,
    ],
    supportedTypes: ['video'],
    requiresCookies: false,
    supportsAudio: true,
  },
  dailymotion: {
    name: 'Dailymotion',
    patterns: [
      /dailymotion\.com\/video\//,
      /dai\.ly\//,
    ],
    supportedTypes: ['video'],
    requiresCookies: false,
    supportsAudio: true,
  },
  twitch: {
    name: 'Twitch',
    patterns: [
      /twitch\.tv\/videos\//,
      /twitch\.tv\/.*\/clip\//,
      /clips\.twitch\.tv\//,
    ],
    supportedTypes: ['video', 'live'],
    requiresCookies: false,
    supportsAudio: true,
  },
  soundcloud: {
    name: 'SoundCloud',
    patterns: [
      /soundcloud\.com\/.+\/.+/,
    ],
    supportedTypes: ['audio', 'playlist'],
    requiresCookies: false,
    supportsAudio: true,
  },
  spotify: {
    name: 'Spotify',
    patterns: [
      /open\.spotify\.com\/track\//,
      /open\.spotify\.com\/episode\//,
      /open\.spotify\.com\/playlist\//,
    ],
    supportedTypes: ['audio', 'playlist'],
    requiresCookies: false,
    supportsAudio: true,
  },
  streamable: {
    name: 'Streamable',
    patterns: [
      /streamable\.com\//,
    ],
    supportedTypes: ['video'],
    requiresCookies: false,
    supportsAudio: true,
  },
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

module.exports = { PLATFORMS, USER_AGENTS };
