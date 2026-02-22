# ===========================================================================
# Retrieva Email Service — Dockerfile
# ===========================================================================

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

EXPOSE 3008

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3008/health || exit 1

CMD ["node", "index.js"]
