# ── ManDev WhatsApp Backend ──
# Runs whatsapp-web.js (Puppeteer/Chromium) on Railway/Docker.

FROM node:18-slim

# Install Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading Chromium (we use the system one)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create sessions directory for WhatsApp auth persistence
RUN mkdir -p /app/sessions

# Railway sets PORT automatically; default to 3001 for local dev
EXPOSE 3001

CMD ["node", "server.js"]
