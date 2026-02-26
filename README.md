# Retrieva

**DORA Compliance Intelligence for Financial Entities**

Retrieva automates third-party ICT risk assessments under DORA (Regulation EU 2022/2554). Upload vendor documentation, get a structured compliance gap report in minutes, and ask follow-up questions to an AI copilot trained on your documents.

**Live:** [retrieva.online](https://retrieva.online) · **Docs:** [andreliar.github.io/Retrieva](https://andreliar.github.io/Retrieva/)

---

## Features

| Feature | Description |
|---------|-------------|
| **DORA Gap Analysis** | Upload vendor ICT contracts or policies → AI produces a structured report with Critical / High / Medium / Low gaps mapped to DORA articles |
| **Multi-Source Ingestion** | File upload (PDF, DOCX, XLSX), URL crawling, Confluence Cloud — all indexed into a unified vector store |
| **DORA Copilot (RAG Q&A)** | Ask compliance questions in natural language; the agentic pipeline retrieves from your docs and the built-in DORA knowledge base |
| **Workspace Isolation** | Multi-tenant: every workspace is fully isolated at the DB and vector store layer (AsyncLocalStorage + Qdrant metadata filter) |
| **Enterprise Security** | PII masking, prompt-injection detection, output sanitisation, httpOnly JWT cookies, AES-256 field encryption |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          retrieva.online                        │
│                             Nginx                               │
└────────────────────┬──────────────────────┬─────────────────────┘
                     │                      │
              ┌──────▼──────┐       ┌───────▼──────┐
              │  Frontend   │       │   Backend    │
              │  Next.js 16 │       │  Express 5   │
              │  React 19   │       │  Node.js 20  │
              └─────────────┘       └──────┬───────┘
                                           │
              ┌────────────────────────────┼──────────────────────┐
              │                            │                       │
       ┌──────▼──────┐            ┌────────▼───────┐     ┌────────▼──────┐
       │   MongoDB   │            │     Qdrant     │     │     Redis     │
       │   (Atlas)   │            │ Vector Store   │     │  Queue/Cache  │
       └─────────────┘            └────────────────┘     └───────────────┘
```

**Data flow — Gap Analysis:**
```
File Upload → BullMQ (assessmentWorker) → PDF/DOCX parse → chunk → embed
           → Qdrant index → LLM gap analysis → structured report
```

**Data flow — RAG Q&A:**
```
User question → multi-query expansion + HyDE → Qdrant retrieval (k=15)
             → cross-encoder re-ranking (RRF) → LLM answer → citations
```

---

## Monorepo Structure

```
.
├── backend/          Express 5 API (ES modules, Node.js 20)
├── frontend/         Next.js 16 App Router (React 19, TypeScript)
├── docs/             Docusaurus documentation site
├── infra/            Terraform (DigitalOcean + Azure OpenAI)
├── nginx/            Reverse proxy config
├── docker-compose.yml                 Local development
├── docker-compose.staging.yml
└── docker-compose.production.yml
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v3, Shadcn/ui, Zustand, React Query |
| Backend | Express 5, Node.js 20, ES modules, BullMQ, Winston |
| AI | Azure OpenAI — `gpt-4o-mini` (LLM) + `text-embedding-3-small` (embeddings) |
| Databases | MongoDB Atlas (documents), Qdrant (vectors), Redis (queues + cache) |
| Auth | JWT (httpOnly cookies, 15 min access / 7 day refresh), bcrypt |
| Infra | DigitalOcean Droplet (fra1), Docker, GHCR, GitHub Actions CI/CD |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Azure OpenAI endpoint (or set `LLM_PROVIDER=openai` with an OpenAI key)

### 1. Clone and install

```bash
git clone https://github.com/AndreLiar/Retrieva.git
cd Retrieva
npm install --legacy-peer-deps
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Fill in at minimum:
#   AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET  (min 32 chars each)
#   ENCRYPTION_KEY  (64 hex chars — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 3. Start infrastructure

```bash
docker compose up -d mongodb redis qdrant minio
```

### 4. Run the app

```bash
npm run dev          # starts backend (port 3007) + frontend (port 3000) concurrently
```

Open [http://localhost:3000](http://localhost:3000), register an account, create a workspace, and upload a document to run your first assessment.

---

## Development Commands

### Root (monorepo)

```bash
npm run dev                  # backend + frontend concurrently
npm run dev:backend          # backend only (nodemon, port 3007)
npm run dev:frontend         # frontend only (Next.js, port 3000)
npm run test                 # backend tests (vitest)
npm run lint                 # lint backend + frontend
```

### Backend

```bash
npm --prefix backend test              # all tests (1099)
npm --prefix backend run test:unit     # unit tests only
npm --prefix backend run test:integration  # integration tests only
npm --prefix backend run lint
npm --prefix backend run lint:fix
```

### Frontend

```bash
npm --prefix frontend run dev
npm --prefix frontend run build        # production build (TypeScript check)
npm --prefix frontend run test:run     # all tests (357)
npm --prefix frontend run lint
```

### Docker (local)

```bash
docker compose up -d                   # all services
docker compose up -d backend           # single service
docker compose logs -f backend         # follow logs
docker compose down
```

---

## Testing

The project has comprehensive test coverage across both services.

| Suite | Count | Runner |
|-------|-------|--------|
| Backend unit tests | 39 files | Vitest (forks pool, sequential) |
| Backend integration tests | 5 files (auth, RAG, conversations, assessment, health) | Vitest + MongoMemoryServer |
| Frontend component/hook tests | 12 files | Vitest + jsdom + React Testing Library |
| **Total** | **1456 tests** | |

Run all:

```bash
npm run test                           # backend (1099 tests)
npm --prefix frontend run test:run     # frontend (357 tests)
```

---

## Project Structure — Backend

```
backend/
├── app.js                    Express app setup, middleware, routes
├── server.js                 HTTP server entry point
├── workers/
│   ├── assessmentWorker.js   BullMQ: fileIndex + gapAnalysis jobs
│   └── documentIndexWorker.js  BullMQ: chunk + embed + upsert to Qdrant
├── controllers/              Route handlers (auth, workspace, assessment, RAG, sources…)
├── services/
│   ├── rag.js                Core RAG pipeline (pre-warmed, history-aware, cached)
│   └── emailService.js       Resend HTTP API (password reset, invitations)
├── models/                   Mongoose models (User, Workspace, Assessment, DocumentSource…)
├── middleware/               Auth, workspace auth, rate limiting, tenant isolation
├── config/                   DB, Redis, queues, LLM provider, embeddings
└── tests/
    ├── unittest/             Unit tests for utils, middleware, models
    └── integrationtest/      End-to-end API tests with in-memory MongoDB
```

## Project Structure — Frontend

```
frontend/src/
├── app/
│   ├── (auth)/               login, register, forgot-password, reset-password, verify-email
│   └── (dashboard)/
│       ├── assessments/      DORA gap analysis — list, new, detail
│       ├── conversations/    RAG Q&A — list + chat thread
│       ├── sources/          Data source management
│       ├── workspaces/       Workspace switcher, members, settings
│       └── settings/         Profile + security
├── components/
│   ├── ui/                   Shadcn/ui primitives (Radix UI)
│   ├── chat/                 Message bubbles, streaming, citation cards
│   ├── layout/               Header, sidebar, modal outlet
│   └── providers/            Auth + theme providers
├── lib/
│   ├── api/                  Axios client + domain modules (auth, rag, assessments…)
│   ├── stores/               Zustand stores (auth, ui, workspace)
│   └── hooks/                useStreaming (SSE), useWorkspace
└── types/index.ts            Shared TypeScript interfaces
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full reference. Key variables:

```bash
# Azure OpenAI (required)
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

# Auth secrets (required — min 32 chars)
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ENCRYPTION_KEY=          # 64 hex chars

# Databases
MONGODB_URI=mongodb://localhost:27017/enterprise_rag
REDIS_URL=redis://localhost:6378
QDRANT_URL=http://localhost:6333

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

---

## CI/CD

GitHub Actions pipelines:

| Workflow | Trigger | Steps |
|----------|---------|-------|
| **CI** (`ci.yml`) | Push / PR to `main`, `dev`, `staging` | Lint → backend tests → security audit → Docker build |
| **CD** (`cd.yml`) | Push to `main` | CI → build & push Docker images to GHCR → SSH deploy to DigitalOcean → health check → auto-rollback on failure |
| **Docs** (`docs.yml`) | Push to `main` (docs/**) | Build + deploy Docusaurus to GitHub Pages |

### Branch strategy

```
feat/<name>  ──PR──►  dev  ──PR──►  main  ──CD──►  production
fix/<name>   ──PR──►  dev
hotfix/<name>         ──PR──────────────►  main
```

---

## Production

| Item | Value |
|------|-------|
| Server | DigitalOcean Droplet, Ubuntu 22.04, fra1 |
| Domain | [retrieva.online](https://retrieva.online) (SSL via Let's Encrypt) |
| Frontend | `ghcr.io/andreliar/retrieva/frontend:latest` |
| Backend | `ghcr.io/andreliar/retrieva/backend:latest` |
| MongoDB | MongoDB Atlas (free M0, `rag.ukqrhqq.mongodb.net`) |
| Vector DB | Qdrant (self-hosted Docker, `qdrant/qdrant:v1.13.2`) |
| AI | Azure OpenAI `oai-rag-backend-wz5nh9.openai.azure.com` |
| Email | Resend (domain `retrieva.online`, eu-west-1) |

---

## Documentation

Full documentation at [andreliar.github.io/Retrieva](https://andreliar.github.io/Retrieva/) — architecture, API reference, deployment guide, security model.

Local preview:

```bash
cd docs && npm start
```

---

## License

ISC
