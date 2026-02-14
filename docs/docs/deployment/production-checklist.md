---
sidebar_position: 3
---

# Production Checklist

Essential tasks before deploying to production.

## Security Checklist

### Secrets & Keys

- [ ] **JWT secrets generated** - Use cryptographically secure random values (min 48 bytes)
  ```bash
  openssl rand -base64 48
  ```

- [ ] **Encryption key generated** - 32-byte hex key for token encryption
  ```bash
  openssl rand -hex 32
  ```

- [ ] **Notion webhook secret set** - For webhook signature verification

- [ ] **Azure OpenAI key secured** - Never commit to version control

- [ ] **Resend API key secured** - Store in encrypted `.env.resend.production.enc`

- [ ] **Environment files excluded** - `.env` in `.gitignore`

### Authentication

- [ ] **JWT_ACCESS_EXPIRY set** - Recommended: 15 minutes
- [ ] **JWT_REFRESH_EXPIRY set** - Recommended: 7 days
- [ ] **Rate limiting configured** - 10 login attempts per 15 minutes
- [ ] **Password requirements enforced** - Min 8 chars, mixed case, numbers, symbols

### Network Security

- [ ] **HTTPS enabled** - TLS 1.3 for all connections
- [ ] **CORS configured** - `ALLOWED_ORIGINS` with specific domains
- [ ] **Helmet headers enabled** - CSP, HSTS, X-Frame-Options
- [ ] **WebSocket secured** - WSS for Socket.io connections

### Data Protection

- [ ] **Tenant isolation enforced** - `ENFORCE_TENANT_ISOLATION=true`
- [ ] **Encryption at rest** - MongoDB and Qdrant encryption
- [ ] **PII masking enabled** - Output scanning for sensitive data
- [ ] **Audit logging enabled** - Security events tracked

## Infrastructure Checklist

### Database

- [ ] **MongoDB replica set** - For high availability
- [ ] **MongoDB authentication** - Username/password or SCRAM
- [ ] **MongoDB indexes created** - Performance optimization
  ```bash
  npm run db:indexes
  ```
- [ ] **Backup strategy defined** - Automated daily backups

### Redis

- [ ] **Redis password set** - AUTH required
- [ ] **Redis persistence configured** - RDB or AOF
- [ ] **Memory limits set** - `maxmemory` policy

### Qdrant

- [ ] **Qdrant API key set** - Authentication enabled
- [ ] **Collection created** - With correct dimensions
- [ ] **Backup strategy defined** - Snapshot schedule

### Container/Server

- [ ] **Non-root user** - Containers run as unprivileged user
- [ ] **Resource limits** - CPU and memory constraints
- [ ] **Health checks** - Kubernetes/Docker health probes
- [ ] **Log rotation** - Prevent disk exhaustion

## Application Checklist

### Configuration

- [ ] **NODE_ENV=production** - Production mode enabled
- [ ] **Debug logging disabled** - `LOG_LEVEL=info` or `warn`
- [ ] **Retrieval tracing disabled** - `LOG_RETRIEVAL_TRACE=false`
- [ ] **Cache enabled** - `RAG_CACHE_ENABLED=true`

### LLM Configuration

- [ ] **Azure OpenAI configured** - All required variables set
- [ ] **Timeouts configured** - LLM and streaming timeouts
- [ ] **Guardrails enabled** - Hallucination blocking active
- [ ] **Fallback messages** - User-friendly error messages

### Email Service

- [ ] **Resend API key configured** - `RESEND_API_KEY` set in production env
- [ ] **Domain verified in Resend** - DKIM, SPF, and DMARC DNS records configured for sender domain
- [ ] **From email set** - `RESEND_FROM_EMAIL` matches a verified Resend domain
- [ ] **Email flows tested** - Password reset, email verification, workspace invitation, welcome emails all sending correctly

### Sync & Workers

- [ ] **Worker processes running** - BullMQ workers active
- [ ] **Stale job recovery** - `STALE_JOB_TIMEOUT_HOURS` configured
- [ ] **Rate limits respected** - Notion API limits honored
- [ ] **Token monitoring enabled** - `NOTION_TOKEN_MONITOR_ENABLED=true`

## Monitoring Checklist

### Logging

- [ ] **Structured logging** - JSON format for aggregation
- [ ] **Log aggregation** - Centralized logging (ELK, Datadog, etc.)
- [ ] **Error tracking** - Sentry or similar service
- [ ] **Request tracing** - Correlation IDs for debugging

### Metrics

- [ ] **Health endpoint** - `/health` returning status
- [ ] **API metrics** - Response times, error rates
- [ ] **LLM metrics** - Token usage, latencies
- [ ] **Queue metrics** - Job processing rates

### Alerting

- [ ] **Error rate alerts** - High error rate notifications
- [ ] **Latency alerts** - Slow response warnings
- [ ] **Token expiry alerts** - Notion token health
- [ ] **Disk/memory alerts** - Resource exhaustion warnings

## Performance Checklist

### Optimization

- [ ] **Embedding concurrency** - `EMBEDDING_MAX_CONCURRENCY` tuned
- [ ] **Chunk filtering** - `ENABLE_CHUNK_FILTER=true`
- [ ] **Re-ranking enabled** - `ENABLE_CROSS_ENCODER_RERANK=true`
- [ ] **Context expansion** - `ENABLE_CONTEXT_EXPANSION=true`

### Caching

- [ ] **RAG cache enabled** - Response caching active
- [ ] **Re-rank cache enabled** - `RERANK_CACHE_TTL` configured
- [ ] **CDN configured** - Static asset caching

### Database Indexes

Ensure these indexes exist:

```javascript
// User
db.users.createIndex({ email: 1 }, { unique: true });

// Conversation
db.conversations.createIndex({ workspaceId: 1, userId: 1 });
db.conversations.createIndex({ updatedAt: -1 });

// Message
db.messages.createIndex({ conversationId: 1, createdAt: 1 });
db.messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// DocumentSource
db.documentsources.createIndex({ workspaceId: 1, sourceId: 1 });
db.documentsources.createIndex({ workspaceId: 1, status: 1 });

// NotionWorkspace
db.notionworkspaces.createIndex({ owner: 1 });
db.notionworkspaces.createIndex({ 'members.user': 1 });
```

## Deployment Checklist

### Pre-Deployment

- [ ] **Dependencies updated** - `npm audit` passed
- [ ] **Tests passing** - All unit and integration tests
- [ ] **Build successful** - Production build completes
- [ ] **Environment validated** - All required variables set

### Deployment

- [ ] **Blue-green or canary** - Zero-downtime deployment
- [ ] **Database migrations** - Schema updates applied
- [ ] **Cache cleared** - Stale cache invalidated
- [ ] **Workers restarted** - Background jobs processing

### Post-Deployment

- [ ] **Health check passing** - `/health` returns 200
- [ ] **Smoke tests passed** - Critical paths verified
- [ ] **Logs reviewed** - No unexpected errors
- [ ] **Metrics baseline** - Performance within expectations

## Backup & Recovery

### Backup Strategy

- [ ] **MongoDB backups** - Daily snapshots, 30-day retention
- [ ] **Redis backups** - RDB snapshots
- [ ] **Qdrant backups** - Collection snapshots
- [ ] **Secrets backup** - Encrypted, off-site storage

### Recovery Plan

- [ ] **RTO defined** - Recovery Time Objective documented
- [ ] **RPO defined** - Recovery Point Objective documented
- [ ] **Recovery tested** - Quarterly restore tests
- [ ] **Runbooks created** - Step-by-step recovery procedures

## Documentation

- [ ] **Architecture documented** - System design docs
- [ ] **Runbooks created** - Operational procedures
- [ ] **API documented** - Swagger/OpenAPI specs
- [ ] **Incident response** - Escalation procedures

## Compliance

- [ ] **GDPR compliance** - Data processing documented
- [ ] **Data retention** - TTL policies implemented
- [ ] **Audit trail** - Access logging enabled
- [ ] **Privacy policy** - User-facing documentation
