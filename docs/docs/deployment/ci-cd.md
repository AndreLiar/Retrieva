---
sidebar_position: 4
---

# CI/CD Pipeline

The project uses GitHub Actions for continuous integration and continuous deployment.

## Overview

```
Push/PR to main/dev/staging
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CI Workflow (ci.yml)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Backend Tests │  │Frontend Tests│  │ RAGAS Service Tests   │ │
│  │  (Node.js)   │  │  (Next.js)   │  │     (Python)          │ │
│  │ + Lint        │  │ + Lint       │  │ + Lint                │ │
│  │ + MongoDB     │  │ + Vitest     │  │ + Pytest              │ │
│  │ + Redis       │  │              │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐ │
│  │   Security   │  │          Docker Build Check              │ │
│  │    Audit     │  │  backend / frontend / ragas-service      │ │
│  └──────────────┘  └──────────────────────────────────────────┘ │
│                           │                                     │
│                    CI Success Gate                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                   (only push to main)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CD Workflow (cd.yml)                         │
│                                                                 │
│  1. Run CI ──► 2. Build & Push  ──► 3. Deploy via SSH           │
│                  to GHCR               to DigitalOcean          │
│                                                                 │
│                                    4. Health Check               │
└─────────────────────────────────────────────────────────────────┘
```

## CI Workflow

**File:** `.github/workflows/ci.yml`

**Triggers:**
- Push to `main`, `dev`, or `staging`
- Pull requests targeting `main`, `dev`, or `staging`
- Called by the CD workflow (`workflow_call`)

### Jobs

| Job | Description | Services |
|-----|-------------|----------|
| `backend-test` | Lint + run Vitest tests | MongoDB 7.0, Redis 7 |
| `frontend-test` | Lint + run Vitest tests | None |
| `backend-security` | `npm audit --audit-level=high` | None |
| `ragas-test` | Flake8 lint + Pytest | None |
| `docker-build` | Build Docker images (no push) for backend, frontend, ragas-service | None |
| `ci-success` | Gate job — fails if `backend-test` or `frontend-test` failed | None |

### Backend Test Environment

The CI job spins up MongoDB and Redis as service containers and sets test-specific environment variables:

```yaml
env:
  NODE_ENV: test
  MONGODB_URI: mongodb://localhost:27017/test_db
  REDIS_URL: redis://localhost:6378
  JWT_ACCESS_SECRET: <test-secret>
  JWT_REFRESH_SECRET: <test-secret>
  ENCRYPTION_KEY: <test-key>
```

## CD Workflow

**File:** `.github/workflows/cd.yml`

**Triggers:**
- Push to `main` only
- Manual dispatch (`workflow_dispatch`)

### Steps

1. **Run CI** — calls the CI workflow as a reusable workflow
2. **Build & Push** — builds Docker images for `backend`, `frontend`, and `ragas-service`, then pushes to GHCR
3. **Deploy via SSH** — connects to the production droplet and runs the deployment script
4. **Health Check** — verifies backend (`/health`) and frontend are responding

### Docker Images

Images are pushed to GitHub Container Registry (GHCR):

```
ghcr.io/andreliar/retrieva/backend
ghcr.io/andreliar/retrieva/frontend
ghcr.io/andreliar/retrieva/ragas-service
```

**Tagging strategy:**
- `latest` — always points to the most recent `main` build
- `<git-sha>` — short SHA of the commit for pinning and rollback

## GitHub Secrets

The CD workflow requires these repository secrets:

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Production droplet IP address |
| `DEPLOY_SSH_KEY` | Private SSH key for the `deploy` user on the droplet |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope (used by the server to pull images) |

:::note
`GITHUB_TOKEN` is automatically available and used to push images to GHCR during the build step. `GHCR_PAT` is a separate token used on the production server to pull private images.
:::

## Secrets Management

Production secrets are encrypted at rest using **SOPS** with **age** encryption.

### Encrypted Files

| File | Contents |
|------|----------|
| `backend/.env.production.enc` | Main backend secrets (DB URIs, API keys, JWT secrets, etc.) |
| `backend/.env.resend.production.enc` | Email service secrets (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) |
| `ragas-service/.env.production.enc` | RAGAS service secrets |

### Decryption During Deployment

The CD workflow decrypts secrets on the production server using an age key stored at `~/.age/key.txt`:

```bash
# Decrypt main backend secrets
SOPS_AGE_KEY_FILE=~/.age/key.txt sops --decrypt \
  --input-type dotenv --output-type dotenv \
  backend/.env.production.enc > backend/.env

# Append email secrets
SOPS_AGE_KEY_FILE=~/.age/key.txt sops --decrypt \
  --input-type dotenv --output-type dotenv \
  backend/.env.resend.production.enc >> backend/.env
```

### Encrypting / Updating Secrets

To update a secret:

```bash
# Edit in place (opens $EDITOR)
SOPS_AGE_KEY_FILE=~/.age/key.txt sops \
  --input-type dotenv --output-type dotenv \
  backend/.env.production.enc

# Or encrypt a new plaintext file
sops --encrypt --age <age-public-key> \
  --input-type dotenv --output-type dotenv \
  backend/.env.plaintext > backend/.env.production.enc
```

:::warning
Never commit plaintext `.env` files. Only `.enc` (encrypted) files belong in the repository.
:::

## Production Deployment Architecture

```
                     Internet
                        │
                   ┌────▼────┐
                   │  Nginx  │  (TLS termination, reverse proxy)
                   └────┬────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     ┌────▼────┐  ┌─────▼────┐  ┌────▼────────┐
     │Frontend │  │ Backend  │  │RAGAS Service │
     │ :3000   │  │  :3007   │  │   :8001      │
     └─────────┘  └────┬─────┘  └──────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     ┌────▼────┐ ┌─────▼───┐ ┌─────▼───┐
     │MongoDB  │ │  Redis  │ │ Qdrant  │
     │ :27017  │ │  :6379  │ │  :6333  │
     └─────────┘ └─────────┘ └─────────┘
```

All services run on a single **DigitalOcean droplet** via `docker-compose.production.yml`.

### Nginx Reverse Proxy

Nginx handles TLS termination and routing. Configuration: `nginx/rag.conf`

| Path | Upstream | Notes |
|------|----------|-------|
| `/api/*` | `backend:3007` | 120s read/send timeout for RAG queries |
| `/socket.io/*` | `backend:3007` | WebSocket upgrade headers |
| `/health` | `backend:3007` | Health check endpoint |
| `/*` | `frontend:3000` | Catch-all for Next.js pages |

**TLS** is managed by **Certbot** (Let's Encrypt) with automatic renewal. Certificates are stored at `/etc/letsencrypt/live/retrieva.online/`.

## Health Check

After deployment, the CD workflow waits 15 seconds then verifies:

```bash
curl -sf http://localhost:3007/health   # Backend API
curl -sf http://localhost:3000           # Frontend
```

The backend `/health` endpoint returns service status including database connectivity and email configuration state.

## Rollback

To roll back to a previous version:

```bash
# SSH into the production server
ssh deploy@<DEPLOY_HOST>
cd /opt/rag

# Find the previous image SHA
docker images ghcr.io/andreliar/retrieva/backend --format "{{.Tag}}"

# Update docker-compose.production.yml to pin the previous SHA
# Or pull a specific tag:
docker pull ghcr.io/andreliar/retrieva/backend:<previous-sha>
docker pull ghcr.io/andreliar/retrieva/frontend:<previous-sha>

# Restart with the pinned images
docker compose -f docker-compose.production.yml up -d
```

Alternatively, revert the commit on `main` and let CD redeploy automatically.
