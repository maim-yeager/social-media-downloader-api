const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);
const { CACHE_PATH } = require('../config/constants');
const { generateCacheKey } = require('../utils/helpers');
const logger = require('../utils/logger');

async function generateVideoThumbnail(videoPath, outputDir) {
  const basename = path.basename(videoPath, path.extname(videoPath));
  const outputPath = path.join(outputDir || path.dirname(videoPath), `${basename}_thumb.jpg`);
  
  if (fs.existsSync(outputPath)) return outputPath;

  try {
    // Try at 10% duration first
    await execAsync(`ffmpeg -i "${videoPath}" -ss 00:00:10 -vframes 1 -vf "scale=640:-2" -q:v 2 "${outputPath}" -y 2>/dev/null`);
    if (fs.existsSync(outputPath)) return outputPath;
  } catch {}

  try {
    // Fallback: first frame
    await execAsync(`ffmpeg -i "${videoPath}" -vframes 1 -vf "scale=640:-2" -q:v 2 "${outputPath}" -y 2>/dev/null`);
    if (fs.existsSync(outputPath)) return outputPath;
  } catch (e) {
    logger.debug('Thumbnail generation failed:', e.message);
  }

  return null;
}

async function generateAudioWaveform(audioPath, outputDir) {
  const basename = path.basename(audioPath, path.extname(audioPath));
  const outputPath = path.join(outputDir || path.dirname(audioPath), `${basename}_wave.png`);

  try {
    await execAsync(
      `ffmpeg -i "${audioPath}" -filter_complex "showwavespic=s=640x200:colors=#00ff88" -frames:v 1 "${outputPath}" -y 2>/dev/null`
    );
    return outputPath;
  } catch (e) {
    logger.debug('Waveform generation failed:', e.message);
    return null;
  }
}

async function resizeImage(inputPath, outputPath, width = 640, height = 360, quality = 85) {
  try {
    const sharp = require('sharp');
    await sharp(inputPath)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toFile(outputPath);
    return outputPath;
  } catch (e) {
    // Fallback to ffmpeg
    try {
      await execAsync(`ffmpeg -i "${inputPath}" -vf "scale=${width}:-2" -q:v 2 "${outputPath}" -y 2>/dev/null`);
      return outputPath;
    } catch {
      return null;
    }
  }
}

async function generatePlaylistCollage(thumbnailUrls, outputPath) {
  // Download first 4 thumbnails and create a collage
  try {
    const axios = require('axios');
    const tempDir = path.dirname(outputPath);
    const tempFiles = [];

    for (let i = 0; i < Math.min(4, thumbnailUrls.length); i++) {
      const tempFile = path.join(tempDir, `thumb_${i}.jpg`);
      const response = await axios.get(thumbnailUrls[i], { responseType: 'arraybuffer', timeout: 10000 });
      fs.writeFileSync(tempFile, response.data);
      tempFiles.push(tempFile);
    }

    if (tempFiles.length >= 2) {
      const inputs = tempFiles.map(f => `-i "${f}"`).join(' ');
      await execAsync(`ffmpeg ${inputs} -filter_complex "tile=2x2" "${outputPath}" -y 2>/dev/null`);
    } else if (tempFiles.length === 1) {
      fs.copyFileSync(tempFiles[0], outputPath);
    }

    // Cleanup temp files
    tempFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });

    return outputPath;
  } catch (e) {
    logger.debug('Collage generation failed:', e.message);
    return null;
  }
}

async function getThumbnailFromUrl(url, outputPath) {
  try {
    const axios = require('axios');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MediaBot/1.0)' },
    });
    fs.writeFileSync(outputPath, response.data);
    return outputPath;
  } catch (e) {
    logger.debug('Thumbnail download failed:', e.message);
    return null;
  }
}

module.exports = {
  generateVideoThumbnail,
  generateAudioWaveform,
  resizeImage,
  generatePlaylistCollage,
  getThumbnailFromUrl,
};
