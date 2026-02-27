---
sidebar_position: 2
---

# Getting Started

This guide will help you set up Retrieva for local development.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 20+ (`node --version`)
- **npm** 10+ (`npm --version`)
- **Docker** and Docker Compose (for infrastructure services)
- **Azure OpenAI** resource with API access

:::tip Optional integrations
Notion OAuth credentials are only required if you want to enable the Notion workspace sync connector. The core DORA assessment workflow (file upload, questionnaires, monitoring, RoI export) works without Notion.
:::

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

# Compliance monitoring
MONITORING_INTERVAL_HOURS=24
INSTITUTION_NAME=Financial Entity

# Email (optional for local dev — emails will be skipped if not set)
RESEND_API_KEY=
SMTP_FROM_NAME=Retrieva
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Notion OAuth (optional — only needed for Notion connector)
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3007/api/v1/notion/callback
```

### 3. Seed the Compliance Knowledge Base

Before running DORA assessments, seed the DORA articles into the compliance knowledge base:

```bash
npm run seed:compliance
```

This command is idempotent — safe to run multiple times.

### 4. Start Development Server

```bash
npm run dev
```

The backend will be available at `http://localhost:3007`.

### 5. Verify Setup

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
NEXT_PUBLIC_WS_URL=http://localhost:3007
NEXT_PUBLIC_APP_NAME=Retrieva
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Running Tests

### Backend Tests

```bash
cd backend

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests
npm test
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

# Qdrant utilities
npm run qdrant:list        # List documents
npm run qdrant:info        # Collection info
npm run qdrant:collections # List collections

# Seed compliance knowledge base
npm run seed:compliance
npm run seed:compliance:reset  # Wipe and re-seed
```

### Frontend

```bash
# Development
npm run dev

# Build for production
npm run build

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

## First Login and Onboarding

Retrieva uses an **organization-first B2B model**. Every user must belong to a company account before accessing the dashboard.

### Scenario A — Creating a new organization (first user / CRO)

1. Register at `/register` — no invite token needed
2. You are redirected to `/onboarding`
3. Fill in your company name, industry, and country → submit
4. You land on `/assessments` and the sidebar shows your company name above the workspace switcher
5. Go to Settings → Team to invite colleagues

### Scenario B — Joining via invite (team member)

1. Admin invites you via Settings → Team → Invite → your email address
2. You receive an email: *"Maria invited you to join HDI Global SE on Retrieva"*
3. Click the link → `/join?token=XXX`
4. If you're not registered yet, you're redirected to `/register?token=XXX&email=you@company.com` — the email is pre-filled
5. Complete registration → you land directly on `/assessments` (no `/onboarding` step)
6. All vendor workspaces of the organization are immediately visible

:::info Role mapping
Your org role (`org_admin`, `analyst`, `viewer`) maps to workspace permissions automatically. See [Organizations API](/api/organizations#role-mapping) for the full mapping table.
:::

## Next Steps

- [Architecture Overview](/architecture/overview) — Understand the system design
- [Organizations API](/api/organizations) — Team onboarding and invitation endpoints
- [API Reference](/api/overview) — Explore available endpoints
- [Background Workers](/backend/workers) — BullMQ worker reference
- [Environment Variables](/deployment/environment-variables) — Full configuration reference
