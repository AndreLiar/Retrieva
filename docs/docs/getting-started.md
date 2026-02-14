---
sidebar_position: 2
---

# Getting Started

This guide will help you set up the RAG Platform for local development.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 20+ (`node --version`)
- **npm** 10+ (`npm --version`)
- **Docker** and Docker Compose (for infrastructure services)
- **Azure OpenAI** resource with API access
- **Notion Account** with developer access

## Infrastructure Setup

### 1. Start Required Services

The platform requires MongoDB, Redis, and Qdrant. Use Docker Compose:

```bash
docker-compose up -d
```

This starts:
- **MongoDB**: `mongodb://localhost:27017`
- **Redis**: `redis://localhost:6378`
- **Qdrant**: `http://localhost:6333`

### 2. Azure OpenAI Setup

The platform uses Azure OpenAI for LLM and embeddings. You'll need:
- An Azure OpenAI resource with deployments for `gpt-4o-mini` and `text-embedding-3-small`
- API key and endpoint from Azure Portal

See [Environment Variables](/deployment/environment-variables) for detailed configuration.

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install --legacy-peer-deps
```

:::note
The `--legacy-peer-deps` flag is required due to some peer dependency conflicts with Express 5.
:::

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server
PORT=3007
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/enterprise_rag

# Redis
REDIS_URL=redis://localhost:6378

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=documents

# Azure OpenAI (REQUIRED)
LLM_PROVIDER=azure_openai
EMBEDDING_PROVIDER=azure
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# JWT (generate with: openssl rand -base64 48)
JWT_ACCESS_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Encryption Key (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your-64-character-hex-encryption-key

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000

# Notion OAuth
NOTION_CLIENT_ID=your-notion-client-id
NOTION_CLIENT_SECRET=your-notion-client-secret
NOTION_REDIRECT_URI=http://localhost:3007/api/v1/notion/callback

# Email (optional for local dev)
RESEND_API_KEY=
SMTP_FROM_NAME=RAG Platform
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### 3. Start Development Server

```bash
npm run dev
```

The backend will be available at `http://localhost:3007`.

### 4. Verify Setup

Check the health endpoint:

```bash
curl http://localhost:3007/health
```

Expected response:
```json
{
  "status": "success",
  "message": "Service is healthy",
  "data": {
    "status": "up",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 123.456
  }
}
```

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3007/api/v1
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Notion Integration

### 1. Create a Notion Integration

1. Go to [Notion Developers](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Name it (e.g., "RAG Platform")
4. Select your workspace
5. Copy the **Internal Integration Token** (for development)
6. Copy the **OAuth Client ID** and **Client Secret** (for production)

### 2. Configure OAuth (Production)

For production, set up OAuth:

1. In your integration settings, add the redirect URI:
   ```
   https://your-domain.com/api/v1/notion/callback
   ```

2. Update your `.env`:
   ```bash
   NOTION_CLIENT_ID=your-client-id
   NOTION_CLIENT_SECRET=your-client-secret
   NOTION_REDIRECT_URI=https://your-domain.com/api/v1/notion/callback
   ```

### 3. Connect Your Workspace

1. Log in to the platform
2. Navigate to Settings → Integrations
3. Click "Connect Notion"
4. Authorize the integration
5. Select pages to sync

## Running Tests

### Backend Tests

```bash
cd backend

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

### Frontend Tests

```bash
cd frontend
npm run test
```

## Common Commands

### Backend

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# Workers only
npm run workers

# Qdrant utilities
npm run qdrant:list        # List documents
npm run qdrant:info        # Collection info
npm run qdrant:collections # List collections
```

### Frontend

```bash
# Development
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## Troubleshooting

### Azure OpenAI Connection Issues

If Azure OpenAI fails to connect:

1. Verify your API key is correct in `.env`
2. Check the endpoint URL format: `https://your-resource.openai.azure.com`
3. Ensure deployments exist for both LLM and embedding models
4. Check Azure Portal for rate limiting or quota issues

```bash
# Test Azure OpenAI connectivity
curl -X POST "${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_LLM_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview" \
  -H "Content-Type: application/json" \
  -H "api-key: ${AZURE_OPENAI_API_KEY}" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

### MongoDB Connection Issues

```bash
# Check MongoDB status
docker exec -it rag-mongodb mongosh --eval "db.adminCommand('ping')"

# View logs
docker logs rag-mongodb
```

### Redis Connection Issues

```bash
# Check Redis status
docker exec -it rag-redis redis-cli ping

# View logs
docker logs rag-redis
```

### Qdrant Issues

```bash
# Check Qdrant health
curl http://localhost:6333/health

# List collections
curl http://localhost:6333/collections
```

## Next Steps

- [Architecture Overview](/architecture/overview) - Understand the system design
- [API Reference](/api/overview) - Explore available endpoints
- [Backend Development](/backend/overview) - Deep dive into backend code
