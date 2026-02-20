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
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Security   │  │Secret Scanning│  │    SAST (Semgrep)    │ │
│  │    Audit     │  │  (Gitleaks)  │  │  nodejs/js/owasp/     │ │
│  │ npm audit    │  │              │  │  secrets rulesets     │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐│
│  │    Trivy Filesystem Scan         │  │  Docker Build Check   │ │
│  │  backend / frontend / ragas     │  │  backend / frontend   │ │
│  │  HIGH+CRITICAL, ignore-unfixed  │  │  ragas-service        │ │
│  └─────────────────────────────────┘  └────────────────────────┘│
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
│                                    4. Health Check (6×15s)       │
│                                    5. Auto-Rollback on failure   │
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
| `backend-security` | `npm audit --audit-level=high --omit=dev` — fails on HIGH/CRITICAL production CVEs | None |
| `ragas-test` | Flake8 lint + Pytest | None |
| `secret-scan` | [Gitleaks](https://github.com/gitleaks/gitleaks) scans full git history for committed secrets | None |
| `sast` | [Semgrep](https://semgrep.dev) static analysis with `p/nodejs`, `p/javascript`, `p/secrets`, `p/owasp-top-ten` rulesets | None |
| `trivy-scan` | [Trivy](https://trivy.dev) filesystem scan for HIGH/CRITICAL CVEs with fixes available (3-way matrix: backend, frontend, ragas-service) | None |
| `docker-build` | Build Docker images (no push) for backend, frontend, ragas-service | None |
| `ci-success` | Gate job — fails if any of the above jobs failed | None |

### Security Scan Configuration

**Gitleaks** allowlists are in `.gitleaks.toml`:
- SOPS-encrypted files (`.env.*.enc`)
- Test fixtures with fake keys
- Lockfiles and CI workflow files

**Semgrep** exclusions are in `.semgrepignore`:
- `backend/tests/` and `frontend/src/tests/` — intentional test patterns
- `nginx/` — reverse-proxy headers are intentional (not vulnerabilities)
- `infra/` — scanned separately by tfsec
- `mcp-servers/` — reference implementations

**Trivy** settings:
- `severity: HIGH,CRITICAL` — low/medium not blocking
- `ignore-unfixed: true` — only fails on CVEs with available fixes
- `--omit=dev` on npm audit — dev dependencies don't reach production images

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
3. **Deploy via SSH** — connects to the production droplet and runs the deployment script:
   - Pull latest code and decrypt secrets (SOPS)
   - Tag current `:latest` images as `:rollback` (pre-deploy safety net)
   - Create Qdrant collection snapshot (best-effort, non-blocking)
   - Pull new images and restart services
4. **Health Check** — retry loop: 6 attempts × 15s = 90s max wait, checking backend `/health` and frontend
5. **Auto-Rollback** — if health checks fail, restore `:rollback` images and restart services. The workflow step exits with code 1, failing the GitHub Actions run

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

After deploying new containers, the CD workflow runs a health check retry loop:

- **6 attempts** with **15-second intervals** (90 seconds max wait)
- Checks both `http://localhost:3007/health` (backend) and `http://localhost:3000` (frontend)
- If both respond successfully on any attempt, the deploy is considered healthy

```bash
# The CD script runs this loop internally:
for i in $(seq 1 6); do
  sleep 15
  curl -sf http://localhost:3007/health && curl -sf http://localhost:3000
done
```

The backend `/health` endpoint returns service status including database connectivity and email configuration state.

## Rollback

### Automatic Rollback (CD Pipeline)

Before pulling new images, the CD pipeline tags the current `:latest` images as `:rollback`:

```bash
docker tag ghcr.io/andreliar/retrieva/backend:latest   ghcr.io/andreliar/retrieva/backend:rollback
docker tag ghcr.io/andreliar/retrieva/frontend:latest   ghcr.io/andreliar/retrieva/frontend:rollback
docker tag ghcr.io/andreliar/retrieva/ragas-service:latest ghcr.io/andreliar/retrieva/ragas-service:rollback
```

If health checks fail after deployment, the pipeline automatically:
1. Restores `:rollback` images back to `:latest`
2. Restarts all services with the previous images
3. Verifies the rollback succeeded
4. Exits with code 1 to fail the GitHub Actions workflow

### Manual Rollback

If you need to roll back manually (e.g., the automatic rollback also failed):

```bash
# SSH into the production server
ssh deploy@<DEPLOY_HOST>
cd /opt/rag

# Option 1: Use rollback images (if still available)
for svc in backend frontend ragas-service; do
  docker tag "ghcr.io/andreliar/retrieva/${svc}:rollback" "ghcr.io/andreliar/retrieva/${svc}:latest"
done
docker compose -f docker-compose.production.yml up -d --remove-orphans

# Option 2: Pull a specific commit SHA from GHCR
docker pull ghcr.io/andreliar/retrieva/backend:<previous-sha>
docker pull ghcr.io/andreliar/retrieva/frontend:<previous-sha>
docker tag ghcr.io/andreliar/retrieva/backend:<previous-sha> ghcr.io/andreliar/retrieva/backend:latest
docker tag ghcr.io/andreliar/retrieva/frontend:<previous-sha> ghcr.io/andreliar/retrieva/frontend:latest
docker compose -f docker-compose.production.yml up -d
```

Alternatively, revert the commit on `main` and let CD redeploy automatically.
