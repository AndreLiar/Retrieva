---
sidebar_position: 2
---

# Environment Variables

Complete reference for all configuration options.

## Backend Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3007` | Server port |
| `NODE_ENV` | `development` | Environment mode |

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/enterprise_rag` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6378` | Redis connection URL |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database URL |
| `QDRANT_COLLECTION_NAME` | `documents` | Qdrant collection name |

### Azure OpenAI Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | Yes | Set to `azure_openai` |
| `EMBEDDING_PROVIDER` | Yes | Set to `azure` |
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Yes | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_LLM_DEPLOYMENT` | Yes | LLM deployment name (e.g., `gpt-4o-mini`) |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Yes | Embedding deployment name |
| `AZURE_OPENAI_API_VERSION` | `2024-02-15-preview` | API version |

### LLM Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL` | `gpt-4o-mini` | LLM model name |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `JUDGE_LLM_MODEL` | `gpt-4o-mini` | Model for LLM Judge |
| `LLM_TEMPERATURE` | `0.3` | Generation temperature |
| `LLM_MAX_TOKENS` | `2000` | Maximum output tokens |
| `LLM_TOP_P` | `1` | Top-p sampling |
| `LLM_TOP_K` | `50` | Top-k sampling |
| `EMBEDDING_MAX_CONCURRENCY` | `10` | Parallel embedding calls |

### Timeout Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_INVOKE_TIMEOUT` | `60000` | LLM invoke timeout (ms) |
| `LLM_STREAM_INITIAL_TIMEOUT` | `30000` | First streaming chunk timeout (ms) |
| `LLM_STREAM_CHUNK_TIMEOUT` | `10000` | Between chunks timeout (ms) |
| `REQUEST_TIMEOUT_MS` | `30000` | Default request timeout |
| `STREAMING_TIMEOUT_MS` | `180000` | Streaming endpoint timeout |
| `SYNC_TIMEOUT_MS` | `600000` | Sync operation timeout |
| `EMBEDDING_TIMEOUT_MS` | `120000` | Embedding batch timeout |

### JWT Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_ACCESS_SECRET` | Yes | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token secret (min 32 chars) |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token expiry |

Generate secrets:
```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Encryption

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for token encryption |
| `ENCRYPTION_KEY_VERSION` | `1` | Current key version |
| `ENCRYPTION_KEY_V1` | No | Previous key (for rotation) |

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Notion Integration

| Variable | Description |
|----------|-------------|
| `NOTION_CLIENT_ID` | OAuth client ID |
| `NOTION_CLIENT_SECRET` | OAuth client secret |
| `NOTION_REDIRECT_URI` | OAuth callback URL |
| `NOTION_WEBHOOK_SECRET` | Webhook signature verification |
| `NOTION_API_RATE_LIMIT` | `2` - API calls per second |

### RAG Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_CACHE_ENABLED` | `true` | Enable response caching |
| `RAG_CACHE_TTL` | `3600` | Cache TTL (seconds) |

### Chunking Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_GROUP_TOKENS` | `400` | Maximum tokens per semantic group |
| `MIN_GROUP_TOKENS` | `200` | Minimum tokens for standalone chunk |
| `MIN_STANDALONE_TOKENS` | `50` | Legacy threshold |
| `MAX_LIST_ITEMS` | `15` | Maximum list items per chunk |
| `EMBEDDING_CONTEXT_TOKENS` | `8192` | Embedding model context window |
| `PENDING_REINDEX` | `false` | Flag for chunking changes |

### Chunk Filtering

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CHUNK_FILTER` | `true` | Filter low-quality chunks |
| `ENABLE_CODE_FILTER` | `true` | Filter code for non-code queries |
| `USE_TIKTOKEN` | `false` | Use accurate token counting |

### Re-ranking

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CROSS_ENCODER_RERANK` | `true` | Enable neural re-ranking |
| `RERANK_PROVIDER` | `llm` | Provider: `cohere`, `llm`, `none` |
| `COHERE_API_KEY` | - | Cohere API key (if using Cohere) |
| `COHERE_RERANK_MODEL` | `rerank-english-v3.0` | Cohere model |
| `RERANK_TOP_N` | `5` | Documents after re-ranking |
| `RERANK_MIN_SCORE` | `0.1` | Minimum score threshold |
| `RERANK_TIMEOUT` | `10000` | Re-ranking timeout (ms) |
| `RERANK_CACHE_TTL` | `300` | Re-ranking cache TTL |

### Context Expansion

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CONTEXT_EXPANSION` | `true` | Fetch surrounding chunks |
| `SIBLING_WINDOW_SIZE` | `1` | Sibling chunks to fetch |
| `MAX_CHUNKS_PER_SOURCE` | `5` | Max chunks per source document |
| `MIN_SCORE_FOR_EXPANSION` | `0.5` | Minimum score for expansion |

### Multi-Tenant Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_TENANT_ISOLATION` | `true` | Enforce workspaceId in all queries |

### Sync Job Recovery

| Variable | Default | Description |
|----------|---------|-------------|
| `STALE_JOB_TIMEOUT_HOURS` | `2` | Hours before job is stale |
| `MAX_SYNC_RECOVERY_ATTEMPTS` | `2` | Max recovery attempts |
| `SYNC_PROGRESS_TIMEOUT_MINUTES` | `30` | Minutes without progress |

### Token Health Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTION_TOKEN_MONITOR_ENABLED` | `true` | Enable token monitoring |
| `TOKEN_CHECK_INTERVAL_HOURS` | `6` | Check frequency |
| `NOTION_AUTO_RECONNECT` | `false` | Auto reconnection |
| `NOTION_TOKEN_EMAIL_NOTIFICATIONS` | `true` | Email on token expiry |

### Guardrails

| Variable | Default | Description |
|----------|---------|-------------|
| `GUARDRAIL_STRICT_HALLUCINATION_BLOCKING` | `true` | Block hallucinated answers |
| `GUARDRAIL_HALLUCINATION_REQUIRE_BOTH` | `false` | Legacy compound condition |
| `GUARDRAIL_LLM_SEED` | - | Seed for reproducibility |
| `GUARDRAIL_USE_SEED_CRITICAL` | `false` | Enable for evaluation |

### Monitoring

| Variable | Description |
|----------|-------------|
| `LANGSMITH_API_KEY` | LangSmith API key |
| `LANGSMITH_PROJECT` | `rag-notion` - Project name |
| `LANGSMITH_ENABLED` | `true` - Enable tracing |
| `RAGAS_SERVICE_URL` | `http://localhost:8001` |
| `RAGAS_TIMEOUT` | `60000` - Evaluation timeout |

### CORS & Security

| Variable | Description |
|----------|-------------|
| `FRONTEND_URL` | Frontend URL for OAuth redirects |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins |

### Email Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | - | Resend API key for sending emails |
| `SMTP_FROM_NAME` | `RAG Platform` | Display name in the "From" field |
| `RESEND_FROM_EMAIL` | `noreply@devandre.sbs` | Sender email address (must match a verified Resend domain) |

:::note
The email service uses the **Resend HTTP API** over HTTPS (port 443). No SMTP ports (25, 465, 587) are needed — this is important because DigitalOcean blocks outbound SMTP traffic.
:::

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level |
| `LOG_RETRIEVAL_TRACE` | `false` | Debug retrieval logging |

## Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3007/api/v1` | Backend API URL |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3007` | WebSocket URL |
| `NEXT_PUBLIC_APP_NAME` | `RAG Platform` | Application name |

## Environment File Template

### Backend (.env.example)

```bash
# Server
PORT=3007
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/enterprise_rag
REDIS_URL=redis://localhost:6378
QDRANT_URL=http://localhost:6333

# Azure OpenAI (REQUIRED)
LLM_PROVIDER=azure_openai
EMBEDDING_PROVIDER=azure
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

# JWT (REQUIRED - generate with: openssl rand -base64 48)
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

# Encryption (REQUIRED - generate with: openssl rand -hex 32)
ENCRYPTION_KEY=

# Notion OAuth
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3007/api/v1/notion/callback

# Email (optional for local dev - emails will be skipped if not set)
RESEND_API_KEY=
SMTP_FROM_NAME=RAG Platform
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Frontend
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (.env.example)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3007/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:3007
NEXT_PUBLIC_APP_NAME=RAG Platform
```

## Secret Generation

### All Required Secrets

```bash
# JWT Access Secret
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"

# JWT Refresh Secret
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"

# Encryption Key (32-byte hex)
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"

# Notion Webhook Secret
echo "NOTION_WEBHOOK_SECRET=$(openssl rand -base64 32)"
```

## Environment-Specific Configurations

### Development

```bash
NODE_ENV=development
LOG_LEVEL=debug
LOG_RETRIEVAL_TRACE=true
RAG_CACHE_ENABLED=false
```

### Production

```bash
NODE_ENV=production
LOG_LEVEL=info
LOG_RETRIEVAL_TRACE=false
RAG_CACHE_ENABLED=true
ENFORCE_TENANT_ISOLATION=true
```

### Testing

```bash
NODE_ENV=test
LOG_LEVEL=error
MONGODB_URI=mongodb://localhost:27017/enterprise_rag_test
```
