FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ffmpeg \
    curl \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create data directories (overridden by mounted volume)
RUN mkdir -p /data/cookies /data/temp/incomplete /data/temp/failed /data/temp/previews \
    /data/cache/metadata /data/cache/thumbnails /data/cache/previews /data/cache/formats /data/cache/media \
    /data/logs /data/backups

# Set permissions
RUN chmod -R 755 /data

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3007/health || exit 1

# Run app
CMD ["node", "server.js"]
