# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Retrieva is a RAG (Retrieval-Augmented Generation) knowledge retrieval platform. It ingests content from Notion workspaces, stores vector embeddings in Qdrant, and provides conversational question-answering via Azure OpenAI (gpt-4o-mini + text-embedding-3-small). The project is a monorepo with three services: a Node.js/Express backend, a Next.js frontend, and a Python RAGAS evaluation service.

## Monorepo Structure

```
backend/     - Express 5 API server (ES modules, Node.js 20)
frontend/    - Next.js 16 App Router (React 19, TypeScript)
ragas-service/ - Python FastAPI for answer quality evaluation
infra/       - Terraform (DigitalOcean & Azure)
nginx/       - Reverse proxy configuration
docs/        - Docusaurus documentation site
```

## Git Strategy

### Branches

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production-ready code | Production (auto via CD) |
| `staging` | Pre-production validation | Staging (manual) |
| `dev` | Development integration | None (local only) |
| `feat/<name>` | New features | None |
| `fix/<name>` | Bug fixes | None |
| `hotfix/<name>` | Urgent production fixes | Production (via main) |

### Workflow

**Features and fixes:**
```
feat/my-feature  --PR-->  dev  --PR-->  main  -->  auto-deploy to production
fix/bug-name     --PR-->  dev  --PR-->  main  -->  auto-deploy to production
```

**Hotfixes (urgent production issues):**
```
hotfix/critical  --PR-->  main  -->  auto-deploy to production
                 then merge main back into dev
```

### Rules

> **IMPORTANT — Claude must always follow these rules without exception:**

- **Always create `feat/`, `fix/`, and `docs/` branches FROM `dev`**, never from `main` or any other branch.
- **NEVER delete the `dev` branch** — it is the integration branch for local testing before production. Feature/fix branches created inside `dev` can be deleted after merge, but `dev` itself must always exist.
- **Never push directly to `main`** — always use a PR from `dev` to `main`.
- The correct flow for every change (feature, bug fix, refactor, docs): create branch from `dev` → commit work → push branch → PR to `dev` → test locally → PR from `dev` to `main` → auto-deploy.
- All PRs to `main` must pass CI (tests, lint, Docker build).
- Branch names: `feat/`, `fix/`, `hotfix/`, `docs/` prefixes followed by a short kebab-case description.
- Delete feature/fix/docs branches **after** they are merged into `dev`. Never delete `dev`.
- `dev` is the local testing integration point — the user tests merged features on `dev` against local infrastructure before promoting to `main`.

### CI/CD Triggers
- **CI** runs on: push to `main`/`dev`/`staging`, PRs to `main`/`dev`/`staging`
- **CD** runs on: push to `main` only (builds Docker images, pushes to GHCR, deploys to DigitalOcean)

## Development Workflow

**All work happens locally on `dev` first.** Never make changes directly on `main` or push untested code to production.

1. **Develop locally** — write code, fix bugs, build features on the `dev` branch (or a `feat/`/`fix/` branch off `dev`)
2. **Test locally** — run the pre-PR gate (see subagent below) before every PR
3. **Push to `dev`** — commit and push to the `dev` branch
4. **PR to `main`** — create a PR from `dev` to `main`, wait for CI to pass
5. **Merge to `main`** — CD auto-deploys to production with health checks and rollback

This applies to everything: features, bug fixes, error corrections, infra changes, config updates. The only exception is `hotfix/` branches for urgent production issues, which go directly to `main` via PR.

---

## Pre-PR Testing Gate (local-test subagent)

> **IMPORTANT — Claude must ALWAYS run this gate before creating any PR (feat → dev, fix → dev, dev → main, hotfix → main). Never skip it.**

### When to invoke

Claude must automatically invoke the **`local-test`** subagent after finishing implementation of any of the following:
- A new feature (`feat/` branch)
- A bug fix (`fix/` or `hotfix/` branch)
- A refactor or performance change (`refactor/` or `perf/` branch)
- A documentation change that touches code (`docs/` with code side-effects)
- Any modification to CI/CD, Docker, or infrastructure files

### What the subagent does

The subagent runs a tiered set of checks based on what changed. Claude must infer the change type from the diff/files touched and run the appropriate tier.

#### Tier 1 — Always run (every change)

```bash
# 1. Backend lint — must exit 0 with 0 errors
npm --prefix backend run lint

# 2. Frontend lint — must exit 0 with 0 errors
npm --prefix frontend run lint

# 3. Backend unit + integration tests — must pass 100%
npm --prefix backend test
```

Expected: `Test Files X passed`, `Tests Y passed`, no failures.

#### Tier 2 — Run when backend files changed

Triggered when any file under `backend/` is modified.

```bash
# Verify the backend starts without crashing (quick smoke test)
# Requires MongoDB, Redis, Qdrant available via docker compose
docker compose up -d mongodb redis qdrant 2>/dev/null || true
sleep 3
node --input-type=module <<'EOF'
import './backend/app.js';
console.log('App module loaded OK');
EOF
```

#### Tier 3 — Run when frontend files changed

Triggered when any file under `frontend/src/` is modified.

```bash
# TypeScript type-check (catches type errors that ESLint misses)
npm --prefix frontend run build 2>&1 | tail -20
```

A successful `next build` (standalone output) is required before any frontend PR to `main`.

#### Tier 4 — Run when docker-compose or infra changed

Triggered when `docker-compose*.yml`, `nginx/`, `infra/`, or `Dockerfile*` files are modified.

```bash
docker compose build --no-cache backend frontend 2>&1 | tail -30
```

### Pass / Fail criteria

| Check | Pass condition |
|-------|---------------|
| Backend lint | Exit 0, **0 errors** (warnings allowed) |
| Frontend lint | Exit 0, **0 errors** (warnings allowed) |
| Backend tests | All test files pass, **0 failures** |
| Frontend build | `next build` completes without error |
| Docker build | Images build without error |

### Failure protocol

If **any** check fails:
1. **Stop** — do not create the PR
2. Fix the failing check in the current branch
3. Re-run the full gate from Tier 1
4. Only proceed to PR when the gate is fully green

### How Claude invokes the subagent

When Claude is ready to commit and push before a PR, it must use the Task tool:

```
Task(
  subagent_type = "Bash",
  description   = "Run pre-PR test gate",
  prompt        = """
    Run the Retrieva pre-PR test gate for a <change_type> change.
    Files changed: <list key files/directories>.

    Steps:
    1. npm --prefix backend run lint   → must exit 0, 0 errors
    2. npm --prefix frontend run lint  → must exit 0, 0 errors
    3. npm --prefix backend test       → must pass 100%
    [4. npm --prefix frontend run build  → if frontend files changed]
    [5. docker compose build backend frontend → if docker/infra changed]

    Report: PASS or FAIL with details for each check.
  """
)
```

Claude must report the gate result to the user before creating the PR, and must not proceed if FAIL is reported.

## Commands

### Root (monorepo)
```bash
npm install --legacy-peer-deps    # Install all workspace dependencies
npm run dev                       # Start backend + frontend concurrently
npm run dev:backend               # Start backend only (nodemon)
npm run dev:frontend              # Start frontend only (next dev)
npm run test                      # Run backend tests
npm run test:ci                   # Run backend tests in CI mode (--run)
npm run lint                      # Lint backend + frontend
```

### Backend (run from backend/ or use npm --prefix backend)
```bash
npm test                          # All tests (vitest run)
npm run test:watch                # Watch mode
npm run test:unit                 # Unit tests only
npm run test:integration          # Integration tests only
vitest run tests/unittest/ragCache.test.js  # Single test file
npm run lint                      # ESLint
npm run lint:fix                  # ESLint with auto-fix
npm run qdrant:list               # List documents in vector store
npm run qdrant:info               # Collection info
npm run qdrant:collections        # List all collections
```

### Frontend (run from frontend/)
```bash
npm run dev                       # Next.js dev server
npm run build                     # Production build (standalone output)
npm run test:run                  # All tests (vitest run)
npm run test                      # Watch mode
npm run test:coverage             # Coverage report
npm run lint                      # ESLint
```

### Docker (local development)
```bash
docker compose up -d              # Start all services (Frontend, Backend, RAGAS, MongoDB, Redis, Qdrant)
docker compose up -d backend      # Start single service
docker compose logs -f backend    # Follow logs
docker compose down               # Stop all
```

## Required Services for Local Development

Before running the backend without Docker, these must be available:
- **MongoDB**: `mongodb://localhost:27017`
- **Redis**: `localhost:6378` (mapped from container 6379)
- **Qdrant**: `http://localhost:6333`

## Architecture

### LLM & Embedding Providers
Production uses **Azure OpenAI** via a provider abstraction layer:
- **LLM**: `gpt-4o-mini` via Azure OpenAI (`config/llmProvider.js`)
- **Embeddings**: `text-embedding-3-small` via Azure OpenAI (`config/embeddings.js`)
- Provider factory supports: Azure OpenAI, OpenAI, Anthropic (configured via `LLM_PROVIDER` env var)

### High-Level Data Flow
```
Notion API -> NotionSyncWorker -> NotionTransformer (semantic chunking)
           -> DocumentIndexWorker -> Qdrant (vector embeddings)

User Question -> RAG Service (history-aware retrieval)
              -> Multi-query expansion + HyDE
              -> Qdrant retrieval (k=15) + RRF re-ranking
              -> LLM answer generation -> Response with citations
```

### Backend Request Flow
```
Routes -> Middleware (auth, validation, rate limiting) -> Controllers -> Services -> Models/Config
```

### Key Backend Services
- **`services/rag.js`** - Core RAG pipeline: pre-warmed at startup, history-aware retrieval, confidence scoring, caching
- **`services/emailService.js`** - Email sending via Resend HTTP API (password reset, verification, invitations, notifications)
- **`services/notionTransformer.js`** - Converts Notion blocks to markdown with semantic block-aware chunking (not character-based)
- **`workers/notionSyncWorker.js`** - BullMQ worker that syncs Notion pages to Qdrant
- **`workers/documentIndexWorker.js`** - BullMQ worker that indexes documents (concurrency: 20, batch: 10)
- **`config/queue.js`** - BullMQ queue definitions (notionSync, documentIndex, memoryDecay)

### Frontend Architecture
- **App Router** with route groups: `(auth)/` for login/register, `(dashboard)/` for main app
- **Shadcn/ui** component library (Radix UI primitives + Tailwind CSS v3)
- **Zustand** stores: `auth-store`, `ui-store`, `workspace-store`
- **API layer**: Axios client in `lib/api/` with React Query for data fetching
- **Real-time**: Socket.io for live updates (streaming responses, presence, notifications)

### Multi-Tenancy
Workspace-based isolation: users belong to workspaces, each workspace connects to a Notion integration. Documents are filtered by workspace during retrieval.

## Code Conventions

### Commit Messages
Enforced by commitlint (Conventional Commits). Subject must be **lowercase**.
```
feat(backend): add workspace invitation system
fix(frontend): resolve modal z-index stacking issue
chore(ci): update deployment workflow
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

### Backend
- ES6 modules (`"type": "module"` in package.json)
- Async/await with `catchAsync()` wrapper for route handlers
- Custom `AppError` for errors with status codes
- Response formatting via `sendSuccess(res, code, message, data)` / `sendError(res, code, message)`
- Winston logger: `import logger from './config/logger.js'`
- **Max 500 lines per file** - extract into separate modules when exceeded

### Frontend
- TypeScript strict mode
- Path alias `@/*` maps to `./src/*`
- Tailwind CSS v3 with HSL CSS variables (raw HSL values in `globals.css`, wrapped with `hsl()` in `tailwind.config.ts`)
- Shadcn/ui components in `src/components/ui/` - do not edit directly unless fixing bugs
- DOMPurify for HTML sanitization, Zod for validation

## Environment Configuration

### Backend
- **`.env`** - Active development config
- **`.env.example`** - Template for developers
- **`.env.production.enc`** - Encrypted production secrets (SOPS with age encryption)
- **`.env.resend.production.enc`** - Encrypted Resend email secrets (SOPS, appended to `.env` during CD)
- When updating env vars, always update BOTH `.env` and `.env.example`

### Email (Resend)
- Uses **Resend HTTP API** (port 443) instead of SMTP — DigitalOcean blocks outbound SMTP ports (25, 465, 587)
- Config: `RESEND_API_KEY`, `SMTP_FROM_NAME`, `RESEND_FROM_EMAIL`
- Domain `retrieva.online` verified with DKIM + SPF + DMARC DNS records (managed in DigitalOcean DNS)
- Sends: password reset, email verification, workspace invitations, welcome emails, error alerts

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_WS_URL` - WebSocket URL

## Testing

### Backend
- Vitest with `pool: 'forks'` and `fileParallelism: false` (sequential execution required for MongoMemoryServer)
- Integration tests spin up in-memory MongoDB; test env vars set in `vitest.config.js`

### Frontend
- Vitest with jsdom environment, React Testing Library
- Test files in `src/tests/` are excluded from `tsconfig.json` to prevent Next.js build failures

## CI/CD Pipeline

Push to `main` triggers both CI and CD workflows:
- **CI** (`ci.yml`): Lint + backend tests (with MongoDB & Redis services) + security audit + Docker build
- **CD** (`cd.yml`): Runs CI, builds Docker images, pushes to GHCR, SSH deploys to DigitalOcean, runs health check

Production secrets are decrypted with SOPS during deployment (`.env.production.enc` + `.env.resend.production.enc` are merged into `.env`). Docker images use standalone Next.js output and multi-stage builds.

## Documentation Site

The Docusaurus documentation site lives in `docs/` and is deployed to **GitHub Pages** at `https://andreliar.github.io/Retrieva/`.

- **Deployment**: Automatic via `.github/workflows/docs.yml` on pushes to `main` that modify `docs/**`
- **Manual deploy**: Trigger the "Deploy Docs" workflow via `workflow_dispatch`
- **Local preview**: `cd docs && npm start`
- **Build check**: `cd docs && npm run build`

### Documentation Maintenance Rule

**Always update the Docusaurus documentation when making changes to the project.** This includes:

- **New features**: Add or update relevant pages in `docs/docs/` (architecture, backend services, API endpoints, frontend components)
- **Configuration changes**: Update `docs/docs/deployment/environment-variables.md` and `docs/docs/getting-started.md` when adding/changing env vars
- **Infrastructure changes**: Update `docs/docs/deployment/ci-cd.md`, `docs/docs/deployment/docker.md`, or `docs/docs/deployment/production-checklist.md`
- **Email/notification changes**: Update `docs/docs/deployment/email-service.md` and `docs/docs/backend/services.md`
- **API changes**: Update the relevant page under `docs/docs/api/`
- **Security changes**: Update `docs/docs/security/`
- **New services or workers**: Add entries to `docs/docs/backend/services.md`, `docs/docs/backend/workers.md`, and `docs/docs/architecture/overview.md`
- **Sidebar updates**: When adding new doc pages, register them in `docs/sidebars.ts`

Use `docs(scope): description` commit type for documentation-only changes. When docs changes accompany code changes, include them in the same commit.

## Production Deployment Reference

### Server Access
- **IP**: `164.90.211.155` (DigitalOcean Droplet, Ubuntu 22.04, fra1)
- **SSH**: `ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155`
- **User**: `deploy` (passwordless sudo)
- **App directory**: `/opt/rag` (git clone of this repo)

### Domain & SSL
- **Domain**: `retrieva.online` (Namecheap registrar, DNS managed at DigitalOcean)
- **SSL**: Let's Encrypt via Certbot, auto-renewal enabled
- **Cert paths**: `/etc/letsencrypt/live/retrieva.online/{fullchain,privkey}.pem`
- **Issue/renew**: `sudo certbot --nginx -d retrieva.online -d www.retrieva.online`

### Nginx
- **Config**: `/etc/nginx/sites-available/retrieva` (symlinked to `sites-enabled/`)
- **Source**: `nginx/rag.conf` in this repo
- **NOT auto-deployed** by CD — must manually copy: `sudo cp /opt/rag/nginx/rag.conf /etc/nginx/sites-available/retrieva && sudo nginx -t && sudo systemctl reload nginx`
- **Routes**: `/api/*` → backend:3007, `/socket.io/*` → backend:3007 (WS), `/health` → backend:3007, `/*` → frontend:3000

### Docker Services (Production)
Compose file: `docker-compose.production.yml`

| Container | Port | Image |
|-----------|------|-------|
| retrieva-frontend | 127.0.0.1:3000 | `ghcr.io/andreliar/retrieva/frontend:latest` |
| retrieva-backend | 127.0.0.1:3007 | `ghcr.io/andreliar/retrieva/backend:latest` |
| retrieva-ragas | 127.0.0.1:8001 | `ghcr.io/andreliar/retrieva/ragas-service:latest` |
| retrieva-redis | 127.0.0.1:6379 | `redis:7-alpine` (256MB, password-protected) |
| retrieva-qdrant | 127.0.0.1:6333 | `qdrant/qdrant:v1.13.2` (1GB limit) |

All ports bind to 127.0.0.1 — only nginx can reach them externally.

### SOPS / Age Encryption
- **Age public key**: `age1ankklkq3280x4a3wgnq52mrkuumaj0t3q87snhwrgmh4l2lw0d8qydxk9d`
- **Local private key**: `~/.age/key.txt`
- **Server private key**: `/home/deploy/.age/key.txt`
- **Config**: `.sops.yaml` in repo root (path regex matching)
- **Encrypted files**: `backend/.env.production.enc`, `backend/.env.resend.production.enc`, `ragas-service/.env.production.enc`
- **Decrypt**: `SOPS_AGE_KEY_FILE=~/.age/key.txt sops --decrypt --input-type dotenv --output-type dotenv backend/.env.production.enc`
- **Edit**: `SOPS_AGE_KEY_FILE=~/.age/key.txt sops backend/.env.production.enc`
- **Re-encrypt**: Copy plaintext to path matching `.sops.yaml` regex, then `sops --encrypt`

### CD Deploy Flow (automatic on push to main)
1. CI tests pass
2. Build Docker images → push to GHCR
3. SSH to server → `git pull origin main`
4. SOPS decrypt `.env.production.enc` → `backend/.env`
5. Append `.env.resend.production.enc` → `backend/.env`
6. Extract `REDIS_PASSWORD` → root `.env` (for docker-compose)
7. Tag current `:latest` images as `:rollback`
8. Qdrant snapshot (best-effort)
9. `docker compose pull && docker compose up -d`
10. Health check retry loop (6 × 15s = 90s max)
11. On failure → restore `:rollback` images → restart → `exit 1`

### GitHub Secrets (repo Settings → Secrets)

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | `164.90.211.155` |
| `DEPLOY_SSH_KEY` | Private SSH key for deploy user |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope |

### External Services
- **MongoDB Atlas**: Free M0, cluster `rag.ukqrhqq.mongodb.net`, DB `enterprise_rag`
- **Qdrant**: Self-hosted Docker container (`qdrant/qdrant:v1.13.2`) on the droplet
- **Azure OpenAI**: Endpoint `oai-rag-backend-wz5nh9.openai.azure.com`, deployments: `gpt-4o-mini`, `text-embedding-3-small`
- **Resend**: Domain `retrieva.online` (eu-west-1), from `noreply@retrieva.online`
- **Notion**: OAuth redirect `https://retrieva.online/api/v1/notion/callback`

### Common Server Commands
```bash
# SSH in
ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155

# Service status
docker compose -f /opt/rag/docker-compose.production.yml ps

# View logs
docker compose -f /opt/rag/docker-compose.production.yml logs -f backend --tail 100

# Restart a service
docker compose -f /opt/rag/docker-compose.production.yml restart backend

# Full restart
docker compose -f /opt/rag/docker-compose.production.yml down && docker compose -f /opt/rag/docker-compose.production.yml up -d

# Check health
curl -s https://retrieva.online/health

# Check disk/memory
df -h && free -h

# Nginx logs
sudo tail -50 /var/log/nginx/error.log

# SSL cert status
sudo certbot certificates
```

## Known Limitations

- `express-mongo-sanitize` and `xss-clean` are disabled due to Express 5 incompatibility
- Memory decay scheduling is non-blocking with timeouts to prevent startup hangs from Redis issues
- Email sending requires Resend domain verification (DKIM/SPF/DMARC DNS records in DigitalOcean DNS for `retrieva.online`)
