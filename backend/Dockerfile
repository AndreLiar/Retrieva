# =============================================================================
# Backend Dockerfile - Multi-stage build for production
# =============================================================================
# Uses node:20-slim (Debian/glibc) instead of node:20-alpine (musl libc).
# Alpine's musl libc is incompatible with @sentry-internal/node-profiling
# native bindings, causing the process to hang on startup.

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-slim AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# -----------------------------------------------------------------------------
# Stage 2: Production Dependencies Only
# -----------------------------------------------------------------------------
FROM node:20-slim AS prod-deps

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --legacy-peer-deps --only=production

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:20-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs expressjs

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=expressjs:nodejs . .

# Remove unnecessary files
RUN rm -rf tests coverage .env.example .eslintrc* .prettierrc* *.md

# Switch to non-root user
USER expressjs

# Expose port
EXPOSE 3007

# Health check — use node (always available) instead of curl/wget which are
# not included in node:20-slim by default.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3007/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Start the application
CMD ["node", "--import", "./instrument.js", "index.js"]
