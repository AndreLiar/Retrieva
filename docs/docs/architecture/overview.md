---
sidebar_position: 1
---

# Architecture Overview

Retrieva is a DORA-compliance RAG platform. The core flow is: **upload vendor documents → AI-generated DORA gap analysis report → conversational Q&A**.

## Services

```
backend/     - Express 5 API server (ES modules, Node.js 20)
frontend/    - Next.js 16 App Router (React 19, TypeScript)
```

## Data Flow

### Gap Analysis Flow

```
User → Upload vendor PDF/DOCX/XLSX
     → assessmentController → assessmentQueue (BullMQ)
     → assessmentWorker:
         1. documentIndexWorker: parse → embed chunks → Qdrant
         2. runGapAnalysis: retrieve chunks → LLM generates DORA gap report
     → Assessment.results stored in MongoDB
     → User downloads report or queries via chat
```

### RAG (Q&A) Flow

```
User Question → RAG Service
              → Embed query → Qdrant retrieval (k=15)
              → Cross-encoder re-ranking (top 5)
              → Context expansion (sibling chunks)
              → LLM generates answer with citations
              → Response streamed to frontend
```

## Model Hierarchy

```
User
└── Workspace  (vendor isolation boundary)
    └── WorkspaceMember (owner | member | viewer)
    └── Assessment (per vendor DORA evaluation)
        └── DocumentSource (indexed chunks in Qdrant)
```

## Backend Request Flow

```
Routes → Middleware (authenticate, requireWorkspaceAccess, validateBody)
       → Controllers → Services / Workers
       → MongoDB (metadata) + Qdrant (vector store)
```

## Key Components

### Controllers
| Controller | Responsibility |
|-----------|----------------|
| `assessmentController.js` | Upload files, start gap analysis, retrieve results |
| `ragController.js` | Conversational Q&A over indexed documents |
| `workspaceController.js` | Workspace CRUD + member management |
| `authController.js` | Register, login, logout, token refresh |
| `conversationController.js` | Conversation history management |
| `healthController.js` | Service health checks |

### Workers (BullMQ)
| Worker | Queue | Purpose |
|--------|-------|---------|
| `assessmentWorker.js` | `assessmentJobs` | Orchestrates file indexing + DORA gap analysis |
| `documentIndexWorker.js` | `documentIndex` | Embeds chunks and upserts to Qdrant |

### Key Services
| Service | Purpose |
|---------|---------|
| `services/rag.js` | Core RAG pipeline: retrieval, re-ranking, answer generation |
| `services/assessmentService.js` | DORA gap analysis logic |
| `services/fileIngestionService.js` | Parses PDF, DOCX, XLSX to plain text |
| `services/emailService.js` | Transactional email via Resend HTTP API |
| `services/storageService.js` | File backup via DigitalOcean Spaces (S3-compatible) |

### Configuration
| Module | Purpose |
|--------|---------|
| `config/llm.js` | Azure OpenAI LLM client (gpt-4o-mini) |
| `config/embeddings.js` | Azure OpenAI embeddings (text-embedding-3-small) |
| `config/vectorStore.js` | Qdrant client + collection management |
| `config/queue.js` | BullMQ queue definitions |
| `config/database.js` | MongoDB connection |
| `config/redis.js` | Redis connection (BullMQ + RAG cache) |

## Infrastructure

```
                 ┌─────────────┐
  HTTPS ─────→  │    Nginx    │
                 └──────┬──────┘
              ┌─────────┴──────────┐
              ↓                    ↓
        ┌──────────┐        ┌──────────┐
        │ Frontend │        │ Backend  │
        │ :3000    │        │ :3007    │
        └──────────┘        └────┬─────┘
                           ┌─────┼──────┐
                           ↓     ↓      ↓
                      MongoDB  Redis  Qdrant
```

**Production** (DigitalOcean fra1):
- Nginx reverse proxy + Let's Encrypt SSL
- Docker Compose with health checks
- MongoDB Atlas (M0 free tier)
- Qdrant v1.13.2 (self-hosted Docker)
- Redis 7 (self-hosted Docker, 256MB)
- DigitalOcean Spaces for file storage
- Azure OpenAI: `gpt-4o-mini` + `text-embedding-3-small`

## Multi-Tenancy

Workspace-based isolation. Every Qdrant query filters by `workspaceId`. The `ENFORCE_TENANT_ISOLATION=true` env var adds a defense-in-depth check at the vector store layer.

## LLM Provider Abstraction

The provider factory (`config/llmProvider.js`) supports Azure OpenAI (default), OpenAI, and Anthropic. Switch via the `LLM_PROVIDER` env var.
