# =============================================================================
# Backend Dockerfile - Multi-stage build for production
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# -----------------------------------------------------------------------------
# Stage 2: Production Dependencies Only
# -----------------------------------------------------------------------------
FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --legacy-peer-deps --only=production

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3007/health || exit 1

# Start the application
CMD ["node", "index.js"]
