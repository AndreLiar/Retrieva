---
sidebar_position: 1
---

# Docker Deployment

Container-based deployment using Docker and Docker Compose.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Stack                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │   Backend    │     │ RAGAS Service│     │   Frontend   │           │
│   │  (Node.js)   │     │   (Python)   │     │  (Next.js)   │           │
│   │  Port: 3007  │     │  Port: 8001  │     │  Port: 3000  │           │
│   └──────┬───────┘     └──────────────┘     └──────────────┘           │
│          │                                                               │
│   ┌──────┴───────────────────────────────────────────────┐              │
│   │                     rag-network                       │              │
│   └──────┬───────────┬───────────────┬───────────────────┘              │
│          │           │               │                                   │
│   ┌──────┴─────┐ ┌───┴────┐   ┌─────┴─────┐                            │
│   │  MongoDB   │ │ Redis  │   │  Qdrant   │                            │
│   │ Port:27017 │ │Port:6378│   │Port: 6333 │                            │
│   └────────────┘ └────────┘   └───────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down
```

## Docker Compose Configuration

```yaml
# docker-compose.yml

version: '3.8'

services:
  # Backend Service (Node.js/Express)
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: rag-backend
    ports:
      - "3007:3007"
    environment:
      - NODE_ENV=development
      - PORT=3007
      - MONGODB_URI=mongodb://mongodb:27017/enterprise_rag
      - REDIS_URL=redis://redis:6379
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - QDRANT_URL=http://qdrant:6333
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - RAGAS_SERVICE_URL=http://ragas-service:8001
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_started
    volumes:
      - ./backend:/app
      - /app/node_modules
    networks:
      - rag-network
    restart: unless-stopped

  # RAGAS Evaluation Service (Python)
  ragas-service:
    build:
      context: ./ragas-service
      dockerfile: Dockerfile
    container_name: rag-ragas
    ports:
      - "8001:8001"
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    networks:
      - rag-network
    restart: unless-stopped

  # MongoDB Database
  mongodb:
    image: mongo:7.0
    container_name: rag-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.runCommand({ping:1})"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - rag-network
    restart: unless-stopped

  # Redis (Caching & BullMQ)
  redis:
    image: redis:7-alpine
    container_name: rag-redis
    ports:
      - "6378:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - rag-network
    restart: unless-stopped

  # Qdrant Vector Database
  qdrant:
    image: qdrant/qdrant:latest
    container_name: rag-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - rag-network
    restart: unless-stopped

networks:
  rag-network:
    driver: bridge

volumes:
  mongodb_data:
  redis_data:
  qdrant_data:
```

## Backend Dockerfile

Multi-stage build for production optimization:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci --legacy-peer-deps

# Stage 2: Production Dependencies Only
FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --legacy-peer-deps --only=production

# Stage 3: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

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

EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3007/health || exit 1

CMD ["node", "index.js"]
```

## Service Commands

### Start Services

```bash
# Start all services in detached mode
docker-compose up -d

# Start specific service
docker-compose up -d backend

# Start with build
docker-compose up -d --build
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop specific service
docker-compose stop backend
```

### Rebuild

```bash
# Rebuild all images
docker-compose build

# Rebuild specific service
docker-compose build backend

# Rebuild without cache
docker-compose build --no-cache backend
```

## Health Checks

### MongoDB

```bash
docker exec rag-mongodb mongosh --eval "db.runCommand({ping:1})"
```

### Redis

```bash
docker exec rag-redis redis-cli ping
```

### Backend

```bash
curl http://localhost:3007/health
```

### Qdrant

```bash
curl http://localhost:6333/collections
```

## Volume Management

### List Volumes

```bash
docker volume ls | grep rag
```

### Backup MongoDB

```bash
docker exec rag-mongodb mongodump --archive > backup.archive
```

### Restore MongoDB

```bash
docker exec -i rag-mongodb mongorestore --archive < backup.archive
```

### Backup Qdrant

```bash
# Qdrant data is stored in the qdrant_data volume
docker run --rm -v rag_qdrant_data:/data -v $(pwd):/backup alpine \
  tar cvf /backup/qdrant-backup.tar /data
```

## Production Considerations

### 1. Environment Variables

Create a `.env.production` file:

```bash
# Copy example and configure
cp backend/.env.example backend/.env.production

# Edit with production values
vim backend/.env.production
```

### 2. MongoDB Authentication

```yaml
mongodb:
  image: mongo:7.0
  environment:
    MONGO_INITDB_ROOT_USERNAME: admin
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  command: ["--auth"]
```

### 3. Redis Password

```yaml
redis:
  image: redis:7-alpine
  command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
```

### 4. Resource Limits

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
      reservations:
        cpus: '0.5'
        memory: 512M
```

### 5. Logging Driver

```yaml
backend:
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

## Scaling

### Horizontal Scaling

```bash
# Scale backend instances
docker-compose up -d --scale backend=3

# Note: Requires load balancer configuration
```

### Load Balancer Example (nginx)

```nginx
upstream backend {
    server backend_1:3007;
    server backend_2:3007;
    server backend_3:3007;
}

server {
    listen 80;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Check health
docker-compose ps

# Inspect container
docker inspect rag-backend
```

### Network Issues

```bash
# List networks
docker network ls

# Inspect network
docker network inspect rag_rag-network

# Test connectivity
docker exec rag-backend ping mongodb
```

### Storage Issues

```bash
# Check disk usage
docker system df

# Clean up unused resources
docker system prune -a
```
