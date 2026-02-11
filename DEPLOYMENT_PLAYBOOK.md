# Retrieva — Deployment Playbook

> Single 8GB DigitalOcean Droplet + Azure OpenAI + GHCR + GitHub Actions

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 1 — Codebase Preparation](#3-phase-1--codebase-preparation)
4. [Phase 2 — Secrets Management (SOPS + age)](#4-phase-2--secrets-management-sops--age)
5. [Phase 3 — Infrastructure with Terraform](#5-phase-3--infrastructure-with-terraform)
6. [Phase 4 — CI/CD Pipeline](#6-phase-4--cicd-pipeline)
7. [Phase 5 — First Deploy (Manual)](#7-phase-5--first-deploy-manual)
8. [Phase 6 — Nginx + SSL](#8-phase-6--nginx--ssl)
9. [Phase 7 — Verify & Smoke Test](#9-phase-7--verify--smoke-test)
10. [Phase 8 — Post-Launch Hardening](#10-phase-8--post-launch-hardening)
11. [Appendix A — Full Secret Map](#appendix-a--full-secret-map)
12. [Appendix B — Resource Budget](#appendix-b--resource-budget)
13. [Appendix C — Rollback Procedures](#appendix-c--rollback-procedures)
14. [Appendix D — Files Created / Modified](#appendix-d--files-created--modified)

---

## 1. Architecture Overview

```
                    ┌─────────────────┐
                    │   GitHub Repo   │
                    │  (source code)  │
                    └────────┬────────┘
                             │
                    push to main branch
                             │
                             ▼
                    ┌─────────────────┐
                    │ GitHub Actions  │
                    │    CI / CD      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │  backend  │ │ frontend  │ │   ragas   │
        │  image    │ │  image    │ │  image    │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                     push to GHCR
            (GitHub Container Registry)
                             │
                             ▼
         ┌───────────────────────────────────────┐
         ┌───────────────────────────────────────┐
         │     DigitalOcean Droplet (4GB/2vCPU)  │
         │          Ubuntu 22.04 LTS             │
         │                                       │
         │  ┌─────────────────────────────────┐  │
         │  │      Nginx (ports 80/443)       │  │
         │  │   SSL termination + reverse     │  │
         │  │   proxy + security headers      │  │
         │  └──────────────┬──────────────────┘  │
         │                 │                     │
         │  ┌──────────────┼──────────────────┐  │
         │  │     Docker Compose (3 svc)      │  │
         │  │                                 │  │
         │  │  frontend   (Next.js)    :3000  │  │
         │  │  backend    (Express)    :3007  │  │
         │  │  ragas      (FastAPI)    :8001  │  │
         │  └─────────────────────────────────┘  │
         └───────────────────────────────────────┘
                         │
                         │ HTTPS connections
                         ▼
         ┌───────────────────────────────────────┐
         │       External Managed Services       │
         │                                       │
         │  MongoDB Atlas    (Free M0)           │
         │  Redis Cloud      (Free 30MB)         │
         │  Qdrant Cloud     (Free 1GB)          │
         │  Azure OpenAI     (LLM + Embed)       │
         └───────────────────────────────────────┘
```

**Routing:**

```
https://devandre.sbs/            → frontend  :3000
https://devandre.sbs/api/        → backend   :3007
https://devandre.sbs/socket.io/  → backend   :3007 (WebSocket upgrade)
```

**Container Images (GHCR):**

```
ghcr.io/<owner>/retrieva/backend        ← custom image (Node.js)
ghcr.io/<owner>/retrieva/frontend       ← custom image (Next.js)
ghcr.io/<owner>/retrieva/ragas-service   ← custom image (Python)
mongodb/mongodb-community-server:7.0     ← public image
redis:7-alpine                           ← public image
qdrant/qdrant:latest                     ← public image
```

---

## 2. Prerequisites

Before starting, you must have:

| # | Requirement | How to Get It |
|---|-------------|---------------|
| 1 | **DigitalOcean account** | https://cloud.digitalocean.com |
| 2 | **Domain name** | `devandre.sbs` (purchased on Namecheap) |
| 3 | **Azure OpenAI credentials** | You already have: endpoint, API key, deployment names |
| 4 | **Notion OAuth app** | https://developers.notion.com — get client ID + secret |
| 5 | **GitHub repo** | Where your code lives (for GHCR + Actions) |
| 6 | **Terraform installed locally** | `brew install terraform` (v1.5+) |
| 7 | **SOPS + age installed locally** | `brew install sops age` |
| 8 | **DigitalOcean API token** | DO Dashboard → API → Generate New Token |
| 9 | **SSH key pair** | `ssh-keygen -t ed25519 -f ~/.ssh/retrieva_deploy` |
| 10 | **MongoDB Atlas account** | https://cloud.mongodb.com — create free M0 cluster |
| 11 | **Redis Cloud account** | https://redis.io/cloud — create free database |
| 12 | **Qdrant Cloud account** | https://cloud.qdrant.io — create free cluster |

---

## 3. Phase 1 — Codebase Preparation

These files must exist in the repo before anything else.

### 1.1 Create `frontend/Dockerfile`

Multi-stage Next.js production build:

```dockerfile
# =============================================================================
# Frontend Dockerfile - Multi-stage build for Next.js
# =============================================================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for public env vars (baked into the JS bundle at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_APP_NAME=Retrieva

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
```

> **Note:** Requires `output: "standalone"` in `next.config.ts`. If not set, add it.

### 1.2 Create `docker-compose.production.yml`

```yaml
# =============================================================================
# Docker Compose - Production (DigitalOcean Single Droplet)
# =============================================================================
# Usage:
#   docker compose -f docker-compose.production.yml pull
#   docker compose -f docker-compose.production.yml up -d
#   docker compose -f docker-compose.production.yml logs -f backend

version: '3.8'

services:
  # ---------------------------------------------------------------------------
  # Frontend (Next.js)
  # ---------------------------------------------------------------------------
  frontend:
    image: ghcr.io/<owner>/retrieva/frontend:latest
    container_name: retrieva-frontend
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # Backend (Node.js/Express)
  # ---------------------------------------------------------------------------
  backend:
    image: ghcr.io/<owner>/retrieva/backend:latest
    container_name: retrieva-backend
    ports:
      - "127.0.0.1:3007:3007"
    env_file:
      - ./backend/.env
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/enterprise_rag
      - REDIS_URL=redis://redis:6379
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - QDRANT_URL=http://qdrant:6333
      - RAGAS_SERVICE_URL=http://ragas-service:8001
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_started
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1536M
        reservations:
          cpus: '0.25'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # RAGAS Evaluation Service (Python/FastAPI)
  # ---------------------------------------------------------------------------
  ragas-service:
    image: ghcr.io/<owner>/retrieva/ragas-service:latest
    container_name: retrieva-ragas
    ports:
      - "127.0.0.1:8001:8001"
    env_file:
      - ./ragas-service/.env
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 768M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # MongoDB 7.0
  # ---------------------------------------------------------------------------
  mongodb:
    image: mongodb/mongodb-community-server:7.0-ubuntu2204
    container_name: retrieva-mongodb
    ports:
      - "127.0.0.1:27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGODB_INITDB_DATABASE=enterprise_rag
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.runCommand({ping:1})"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2048M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # Redis 7
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: retrieva-redis
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "200mb", "--maxmemory-policy", "allkeys-lru"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # Qdrant Vector Database
  # ---------------------------------------------------------------------------
  qdrant:
    image: qdrant/qdrant:latest
    container_name: retrieva-qdrant
    ports:
      - "127.0.0.1:6333:6333"
      - "127.0.0.1:6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1536M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - rag-network

networks:
  rag-network:
    driver: bridge

volumes:
  mongodb_data:
  redis_data:
  qdrant_data:
```

> **Important:** Replace `<owner>` with your GitHub username or org name.
> All ports bind to `127.0.0.1` — only Nginx (on the host) can reach them. No direct external access.

### 1.3 Create `nginx/rag.conf`

```nginx
# =============================================================================
# Nginx Reverse Proxy - Retrieva
# =============================================================================
# Place in: /etc/nginx/sites-available/retrieva
# Symlink:  ln -s /etc/nginx/sites-available/retrieva /etc/nginx/sites-enabled/

upstream frontend {
    server 127.0.0.1:3000;
}

upstream backend {
    server 127.0.0.1:3007;
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name devandre.sbs www.devandre.sbs;
    return 301 https://$server_name$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name devandre.sbs www.devandre.sbs;

    # --- SSL (managed by Certbot) ---
    ssl_certificate     /etc/letsencrypt/live/devandre.sbs/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/devandre.sbs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # --- Security Headers ---
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # --- Request limits ---
    client_max_body_size 50M;

    # --- Backend API ---
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running RAG queries
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # --- WebSocket (Socket.io) ---
    location /socket.io/ {
        proxy_pass http://backend/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # --- Health check (backend) ---
    location /health {
        proxy_pass http://backend/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # --- Frontend (catch-all) ---
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 1.4 Create `.sops.yaml` (repo root)

```yaml
# =============================================================================
# SOPS Configuration — defines which keys encrypt which files
# =============================================================================
creation_rules:
  # Production env files encrypted with the server's age key
  - path_regex: \.env\.production\.enc$
    age: "age1your-server-public-key-here"

  # Staging env files (if needed later)
  - path_regex: \.env\.staging\.enc$
    age: "age1your-staging-public-key-here"
```

### 1.5 Update `.gitignore`

Add these lines:

```gitignore
# =============================================================================
# Secrets — NEVER commit plaintext env files
# =============================================================================
**/.env
**/.env.production
**/.env.staging
**/.env.local

# Encrypted env files — SAFE to commit (uncomment when ready)
# !**/*.env.production.enc

# Terraform state and secrets
**/terraform.tfvars
**/terraform.tfstate
**/terraform.tfstate.backup
**/.terraform/

# Age private keys
*.age.key
```

---

## 4. Phase 2 — Secrets Management (SOPS + age)

### 2.1 Generate age keypair (one-time, on your local machine)

```bash
# Generate keypair
age-keygen -o retrieva-server.age.key

# Output looks like:
#   Public key: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   (private key saved to retrieva-server.age.key)
```

**Save the public key** — put it in `.sops.yaml`.
**Save the private key** — you'll add it to:
- GitHub Secrets as `AGE_SECRET_KEY`
- The server at `/opt/rag/.age.key`

### 2.2 Update `.sops.yaml` with your public key

Replace `age1your-server-public-key-here` with the actual public key from step 2.1.

### 2.3 Create and encrypt `.env.production` files

```bash
# --- Backend ---
cp backend/.env.production.example backend/.env.production
# Edit backend/.env.production with REAL values:
#   JWT_ACCESS_SECRET=<openssl rand -base64 48>
#   JWT_REFRESH_SECRET=<openssl rand -base64 48>
#   ENCRYPTION_KEY=<openssl rand -hex 32>
#   AZURE_OPENAI_API_KEY=<your key>
#   AZURE_OPENAI_ENDPOINT=<your endpoint>
#   NOTION_CLIENT_ID=<your id>
#   NOTION_CLIENT_SECRET=<your secret>
#   NOTION_REDIRECT_URI=https://devandre.sbs/api/v1/notion/callback
#   FRONTEND_URL=https://devandre.sbs
#   ALLOWED_ORIGINS=https://devandre.sbs
#   MONGODB_URI=mongodb+srv://<user>:<pwd>@<cluster>.mongodb.net/enterprise_rag
#   REDIS_URL=redis://:<password>@<host>:<port>
#   QDRANT_URL=https://<cluster-id>.qdrant.io
#   QDRANT_API_KEY=<your-qdrant-api-key>

# Encrypt it
sops --encrypt --age age1xxxxxxx... backend/.env.production > backend/.env.production.enc

# --- Frontend ---
cat > frontend/.env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://devandre.sbs/api/v1
NEXT_PUBLIC_WS_URL=https://devandre.sbs
NEXT_PUBLIC_APP_NAME=Retrieva
EOF

sops --encrypt --age age1xxxxxxx... frontend/.env.production > frontend/.env.production.enc

# --- RAGAS Service ---
cat > ragas-service/.env.production << 'EOF'
RAGAS_SERVICE_PORT=8001
RAGAS_LLM_PROVIDER=openai
OPENAI_API_KEY=<your-azure-key-or-openai-key>
EOF

sops --encrypt --age age1xxxxxxx... ragas-service/.env.production > ragas-service/.env.production.enc

# --- Delete plaintext (IMPORTANT) ---
rm backend/.env.production frontend/.env.production ragas-service/.env.production

# --- Commit encrypted files ---
git add backend/.env.production.enc frontend/.env.production.enc ragas-service/.env.production.enc .sops.yaml
git commit -m "chore: add encrypted production env files"
```

### 2.4 Secrets overview — what goes where

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         SECRET STORAGE MAP                               │
├─────────────────────────────┬───────────────┬────────────┬───────────────┤
│         Secret              │ GitHub Action │ SOPS (.enc │ Server (.env) │
│                             │   Secrets     │  in git)   │ at runtime    │
├─────────────────────────────┼───────────────┼────────────┼───────────────┤
│ DEPLOY_SSH_KEY              │      Yes      │     -      │       -       │
│ DEPLOY_HOST                 │      Yes      │     -      │       -       │
│ DEPLOY_USER                 │      Yes      │     -      │       -       │
│ AGE_SECRET_KEY              │      Yes      │     -      │  Yes (.age)   │
│ DIGITALOCEAN_ACCESS_TOKEN   │      Yes      │     -      │       -       │
│ ─────────────────────────── │ ───────────── │ ────────── │ ───────────── │
│ JWT_ACCESS_SECRET           │       -       │    Yes     │  Decrypted    │
│ JWT_REFRESH_SECRET          │       -       │    Yes     │  Decrypted    │
│ ENCRYPTION_KEY              │       -       │    Yes     │  Decrypted    │
│ AZURE_OPENAI_API_KEY        │       -       │    Yes     │  Decrypted    │
│ AZURE_OPENAI_ENDPOINT       │       -       │    Yes     │  Decrypted    │
│ NOTION_CLIENT_ID            │       -       │    Yes     │  Decrypted    │
│ NOTION_CLIENT_SECRET        │       -       │    Yes     │  Decrypted    │
│ MONGODB_URI (internal)      │       -       │     -      │  In compose   │
│ REDIS_URL (internal)        │       -       │     -      │  In compose   │
└─────────────────────────────┴───────────────┴────────────┴───────────────┘
```

---

## 5. Phase 3 — Infrastructure with Terraform

### 3.1 Restructure `infra/` directory

```bash
# Move existing Azure files
mkdir -p infra/azure
mv infra/main.tf infra/variables.tf infra/outputs.tf infra/providers.tf infra/azure/
mv infra/terraform.tfvars.example infra/azure/  # if it exists

# Create DigitalOcean directory
mkdir -p infra/digitalocean
```

### 3.2 Create `infra/digitalocean/providers.tf`

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.34"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}
```

### 3.3 Create `infra/digitalocean/variables.tf`

```hcl
variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "retrieva"
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "fra1" # Frankfurt — close to Azure West Europe
}

variable "droplet_size" {
  description = "Droplet size slug"
  type        = string
  default     = "s-2vcpu-4gb" # 2 vCPU, 4 GB RAM, ~$24/mo
}

variable "domain_name" {
  description = "Your domain name"
  type        = string
  default     = "devandre.sbs"
}

variable "ssh_public_key_path" {
  description = "Path to your SSH public key"
  type        = string
  default     = "~/.ssh/retrieva_deploy.pub"
}
```

### 3.4 Create `infra/digitalocean/main.tf`

```hcl
# =============================================================================
# DigitalOcean Infrastructure — Single Droplet
# =============================================================================

# SSH Key
resource "digitalocean_ssh_key" "deploy" {
  name       = "${var.project_name}-deploy-key"
  public_key = file(var.ssh_public_key_path)
}

# Droplet
resource "digitalocean_droplet" "app" {
  name     = "${var.project_name}-app"
  image    = "ubuntu-22-04-x64"
  size     = var.droplet_size
  region   = var.region
  ssh_keys = [digitalocean_ssh_key.deploy.fingerprint]

  user_data = file("${path.module}/user-data.sh")

  tags = [var.project_name, "production"]
}

# Firewall
resource "digitalocean_firewall" "app" {
  name        = "${var.project_name}-firewall"
  droplet_ids = [digitalocean_droplet.app.id]

  # SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP (for Certbot challenge + redirect)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # All outbound
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Project (groups resources in DO dashboard)
resource "digitalocean_project" "app" {
  name        = var.project_name
  description = "Retrieva RAG Platform"
  purpose     = "Web Application"
  environment = "Production"
  resources   = [digitalocean_droplet.app.urn]
}
```

### 3.5 Create `infra/digitalocean/dns.tf`

```hcl
# =============================================================================
# DNS — Domain + A Records
# =============================================================================
# NOTE: You must point your domain's nameservers to DigitalOcean:
#   ns1.digitalocean.com
#   ns2.digitalocean.com
#   ns3.digitalocean.com

resource "digitalocean_domain" "main" {
  name = var.domain_name
}

resource "digitalocean_record" "root" {
  domain = digitalocean_domain.main.id
  type   = "A"
  name   = "@"
  value  = digitalocean_droplet.app.ipv4_address
  ttl    = 300
}

resource "digitalocean_record" "www" {
  domain = digitalocean_domain.main.id
  type   = "A"
  name   = "www"
  value  = digitalocean_droplet.app.ipv4_address
  ttl    = 300
}
```

### 3.6 Create `infra/digitalocean/outputs.tf`

```hcl
output "droplet_ip" {
  description = "Droplet public IPv4 address"
  value       = digitalocean_droplet.app.ipv4_address
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh deploy@${digitalocean_droplet.app.ipv4_address}"
}

output "droplet_id" {
  description = "Droplet ID"
  value       = digitalocean_droplet.app.id
}

output "domain" {
  description = "Domain name"
  value       = var.domain_name
}
```

### 3.7 Create `infra/digitalocean/user-data.sh`

This is the cloud-init script that runs once when the droplet is first created:

```bash
#!/bin/bash
set -euo pipefail

# =============================================================================
# Cloud-init — Bootstrap DigitalOcean Droplet for Retrieva
# =============================================================================
# This runs ONCE on first boot. It installs:
#   - Docker + Docker Compose
#   - Nginx + Certbot
#   - age (for SOPS decryption)
#   - Creates 'deploy' user
#   - Configures UFW firewall

export DEBIAN_FRONTEND=noninteractive

# --- System Update ---
apt-get update && apt-get upgrade -y

# --- Create deploy user ---
useradd -m -s /bin/bash -G sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# --- Install Docker ---
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable docker
systemctl start docker

# --- Install Docker Compose plugin ---
apt-get install -y docker-compose-plugin

# --- Install Nginx ---
apt-get install -y nginx
systemctl enable nginx

# --- Install Certbot ---
apt-get install -y certbot python3-certbot-nginx

# --- Install age (for SOPS decryption) ---
AGE_VERSION="v1.2.0"
curl -L -o /tmp/age.tar.gz "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-amd64.tar.gz"
tar -xzf /tmp/age.tar.gz -C /tmp
mv /tmp/age/age /usr/local/bin/age
mv /tmp/age/age-keygen /usr/local/bin/age-keygen
chmod +x /usr/local/bin/age /usr/local/bin/age-keygen
rm -rf /tmp/age*

# --- Install SOPS ---
SOPS_VERSION="v3.9.0"
curl -L -o /usr/local/bin/sops "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.amd64"
chmod +x /usr/local/bin/sops

# --- Create app directory ---
mkdir -p /opt/rag
chown deploy:deploy /opt/rag

# --- Configure UFW ---
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# --- Configure Docker log rotation ---
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# --- Disable root SSH login ---
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# --- Enable unattended security updates ---
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "=== Cloud-init complete ==="
```

### 3.8 Create `infra/digitalocean/terraform.tfvars.example`

```hcl
# Copy to terraform.tfvars and fill in real values
# terraform.tfvars is gitignored — NEVER commit it

do_token            = "dop_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
domain_name         = "devandre.sbs"  # Already purchased on Namecheap
region              = "fra1"
droplet_size        = "s-4vcpu-8gb"
ssh_public_key_path = "~/.ssh/retrieva_deploy.pub"
```

### 3.9 Run Terraform

```bash
cd infra/digitalocean

# Copy and fill in your values
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# Initialize
terraform init

# Preview
terraform plan

# Create everything
terraform apply

# Note the output:
#   droplet_ip = "xxx.xxx.xxx.xxx"
#   ssh_command = "ssh deploy@xxx.xxx.xxx.xxx"
```

### 3.10 Post-Terraform: manual steps on the server

```bash
# SSH into the new server
ssh deploy@<droplet-ip>

# Verify everything installed
docker --version          # Docker 24+
docker compose version    # v2.x
nginx -v                  # 1.18+
age --version             # v1.2.0
sops --version            # 3.9.0

# Place the age private key on the server
mkdir -p /opt/rag
cat > /opt/rag/.age.key << 'EOF'
# created: 2024-xx-xx
# public key: age1xxxxxxxx
AGE-SECRET-KEY-1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
EOF
chmod 600 /opt/rag/.age.key
```

---

## 6. Phase 4 — CI/CD Pipeline

### 4.1 Add GitHub Secrets

Go to: **GitHub Repo → Settings → Secrets and variables → Actions**

| Secret Name | Value |
|-------------|-------|
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/retrieva_deploy` (private key) |
| `DEPLOY_HOST` | Droplet IP from Terraform output |
| `DEPLOY_USER` | `deploy` |
| `AGE_SECRET_KEY` | Contents of `retrieva-server.age.key` (the private key line) |

### 4.2 Update `.github/workflows/ci.yml`

Add these jobs to the existing CI pipeline:

```yaml
  # ===========================================================================
  # Frontend Tests (NEW)
  # ===========================================================================
  frontend-test:
    name: Frontend Tests
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: ./frontend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: './frontend/package-lock.json'

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Run linting
        run: npm run lint --if-present

      - name: Run tests
        run: npm run test:run --if-present
```

Update the `docker-build` job to verify all 3 images:

```yaml
  docker-build:
    name: Docker Build Check
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: false
          tags: retrieva-backend:test
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build Frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: false
          tags: retrieva-frontend:test
          build-args: |
            NEXT_PUBLIC_API_URL=https://test.example.com/api/v1
            NEXT_PUBLIC_WS_URL=https://test.example.com
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build RAGAS image
        uses: docker/build-push-action@v5
        with:
          context: ./ragas-service
          push: false
          tags: retrieva-ragas:test
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Update `ci-success` gate:

```yaml
  ci-success:
    name: CI Success
    needs: [backend-test, backend-security, frontend-test, ragas-test, docker-build]
    # ... rest stays the same
```

### 4.3 Rewrite `.github/workflows/cd.yml`

```yaml
# =============================================================================
# Continuous Deployment Pipeline
# =============================================================================
name: CD

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'production'
        type: choice
        options:
          - production

env:
  NODE_VERSION: '20.x'
  PYTHON_VERSION: '3.11'
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ${{ github.repository }}/backend
  FRONTEND_IMAGE: ${{ github.repository }}/frontend
  RAGAS_IMAGE: ${{ github.repository }}/ragas-service

jobs:
  # ===========================================================================
  # Run CI First
  # ===========================================================================
  ci:
    name: Run CI Checks
    uses: ./.github/workflows/ci.yml

  # ===========================================================================
  # Build Backend Image
  # ===========================================================================
  build-backend:
    name: Build Backend
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          target: runner
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===========================================================================
  # Build Frontend Image
  # ===========================================================================
  build-frontend:
    name: Build Frontend
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            NEXT_PUBLIC_API_URL=https://${{ vars.DOMAIN_NAME }}/api/v1
            NEXT_PUBLIC_WS_URL=https://${{ vars.DOMAIN_NAME }}
            NEXT_PUBLIC_APP_NAME=Retrieva
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===========================================================================
  # Build RAGAS Image
  # ===========================================================================
  build-ragas:
    name: Build RAGAS Service
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.RAGAS_IMAGE }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./ragas-service
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===========================================================================
  # Deploy to Production
  # ===========================================================================
  deploy:
    name: Deploy to Production
    needs: [build-backend, build-frontend, build-ragas]
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            set -euo pipefail

            cd /opt/rag

            # --- Pull latest code (for compose file + encrypted envs) ---
            git pull origin main

            # --- Decrypt env files using SOPS + age ---
            export SOPS_AGE_KEY_FILE=/opt/rag/.age.key
            sops --decrypt backend/.env.production.enc > backend/.env
            sops --decrypt ragas-service/.env.production.enc > ragas-service/.env
            chmod 600 backend/.env ragas-service/.env

            # --- Login to GHCR ---
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

            # --- Pull new images ---
            docker compose -f docker-compose.production.yml pull

            # --- Deploy with zero-downtime restart ---
            docker compose -f docker-compose.production.yml up -d --remove-orphans

            # --- Wait for health checks ---
            echo "Waiting for services to be healthy..."
            sleep 15

            # --- Verify backend health ---
            if curl -sf http://localhost:3007/health > /dev/null; then
              echo "Backend: HEALTHY"
            else
              echo "Backend: UNHEALTHY — rolling back"
              docker compose -f docker-compose.production.yml rollback 2>/dev/null || true
              exit 1
            fi

            # --- Verify frontend health ---
            if curl -sf http://localhost:3000 > /dev/null; then
              echo "Frontend: HEALTHY"
            else
              echo "Frontend: UNHEALTHY"
              exit 1
            fi

            # --- Cleanup old images ---
            docker image prune -f

            echo "=== Deployment successful ==="
```

> **Note:** Set `DOMAIN_NAME` as a GitHub Actions **Variable** (not secret) under Settings → Variables.

### 4.4 Full CI/CD Flow Summary

```
Developer pushes to main
        │
        ▼
┌─── CI ───────────────────────────────────┐
│  backend-test     ─┐                     │
│  backend-security  ├─ run in parallel    │
│  frontend-test     │                     │
│  ragas-test       ─┘                     │
│  docker-build     (all 3 images)         │
│  ci-success       (gate)                 │
└──────────────────────────────────────────┘
        │ all pass
        ▼
┌─── CD ───────────────────────────────────┐
│  build-backend  ─┐                       │
│  build-frontend  ├─ parallel → push GHCR │
│  build-ragas    ─┘                       │
│                                          │
│  deploy ─────────────────────────────    │
│  │ SSH into droplet                      │
│  │ git pull (compose + encrypted envs)   │
│  │ sops decrypt → .env                   │
│  │ docker compose pull                   │
│  │ docker compose up -d                  │
│  │ health check → rollback on failure    │
│  └───────────────────────────────────    │
└──────────────────────────────────────────┘
```

---

## 7. Phase 5 — First Deploy (Manual)

The very first deployment must be done manually (before CI/CD can take over).

### 5.1 SSH into the server

```bash
ssh deploy@<droplet-ip>
```

### 5.2 Clone the repo

```bash
cd /opt/rag
git clone https://github.com/<owner>/retrieva.git .
```

### 5.3 Place the age key

```bash
# Copy your age private key to the server
cat > /opt/rag/.age.key << 'EOF'
AGE-SECRET-KEY-1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
EOF
chmod 600 /opt/rag/.age.key
```

### 5.4 Decrypt env files

```bash
export SOPS_AGE_KEY_FILE=/opt/rag/.age.key
sops --decrypt backend/.env.production.enc > backend/.env
sops --decrypt ragas-service/.env.production.enc > ragas-service/.env
chmod 600 backend/.env ragas-service/.env
```

### 5.5 Login to GHCR and start services

```bash
# Login to GitHub Container Registry
echo "<your-github-pat>" | docker login ghcr.io -u <your-github-username> --password-stdin

# Pull and start all services
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d

# Verify
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f backend
```

---

## 8. Phase 6 — Nginx + SSL

### 6.1 Copy nginx config

```bash
# On the server
sudo cp /opt/rag/nginx/rag.conf /etc/nginx/sites-available/retrieva

# Edit: replace devandre.sbs with your actual domain
sudo vim /etc/nginx/sites-available/retrieva

# Enable the site
sudo ln -s /etc/nginx/sites-available/retrieva /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 6.2 Get SSL certificate (before enabling HTTPS in nginx)

```bash
# Temporarily comment out the SSL server block in nginx config
# Keep only the port 80 block, change it to serve certbot challenge:
sudo vim /etc/nginx/sites-available/retrieva

# Temporary config for cert generation:
# server {
#     listen 80;
#     server_name devandre.sbs www.devandre.sbs;
#     location / { return 200 'ok'; }
# }

sudo nginx -t
sudo systemctl reload nginx

# Get the cert
sudo certbot --nginx -d devandre.sbs -d www.devandre.sbs

# Certbot will auto-modify the nginx config to add SSL
# Restore the full config from the repo and reload:
sudo cp /opt/rag/nginx/rag.conf /etc/nginx/sites-available/retrieva
# Update domain name + verify cert paths match
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 Set up auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot auto-installs a systemd timer, verify:
sudo systemctl list-timers | grep certbot
```

### 6.4 Verify HTTPS

```bash
curl -I https://devandre.sbs           # Should return 200
curl -I https://devandre.sbs/api/v1    # Should return from backend
curl -I http://devandre.sbs            # Should redirect to HTTPS (301)
```

---

## 9. Phase 7 — Verify & Smoke Test

Run through this checklist after the first deployment:

```
[ ] https://devandre.sbs loads the frontend
[ ] https://devandre.sbs/api/v1 returns API response
[ ] https://devandre.sbs/health returns { status: "ok" }
[ ] Register a new user account
[ ] Login with the new account
[ ] Create a workspace
[ ] Connect Notion via OAuth (verify callback URL works)
[ ] Sync Notion pages
[ ] Ask a RAG question and get an answer
[ ] WebSocket real-time notifications work
[ ] Check logs: docker compose -f docker-compose.production.yml logs --tail 50
```

---

## 10. Phase 8 — Post-Launch Hardening

### 8.1 MongoDB backups

MongoDB Atlas M0 free tier includes **daily automated backups** managed by Atlas.
No manual backup cron needed.

To verify: MongoDB Atlas Dashboard → your cluster → **Backup** tab.

For manual export if needed:
```bash
# Install mongodump locally or on the server
# Export from Atlas
mongodump --uri="mongodb+srv://<user>:<pwd>@<cluster>.mongodb.net/enterprise_rag" \
  --archive=backup-$(date +%Y%m%d).archive
```

### 8.2 DigitalOcean monitoring alerts

Set up in DigitalOcean Dashboard → Monitoring → Create Alert:

| Alert | Threshold | Window |
|-------|-----------|--------|
| CPU usage | > 80% | 5 min |
| Memory usage | > 85% | 5 min |
| Disk usage | > 80% | 15 min |

### 8.3 Log monitoring

```bash
# Quick check: are any containers restarting?
docker compose -f /opt/rag/docker-compose.production.yml ps

# Check backend errors
docker logs retrieva-backend --since 1h 2>&1 | grep -i error

# Check disk space
df -h
```

### 8.4 Security hardening verification

```bash
# Verify no ports exposed beyond 22, 80, 443
sudo ufw status

# Verify Docker ports bind to 127.0.0.1 only
sudo ss -tlnp | grep docker

# Verify root login disabled
grep PermitRootLogin /etc/ssh/sshd_config
# Should show: PermitRootLogin no

# Verify .env file permissions
ls -la /opt/rag/backend/.env
# Should show: -rw------- deploy deploy
```

---

## Appendix A — Full Secret Map

```
┌───────────────────────────────┬─────────────┬───────────────────┬───────────────────┐
│           Secret              │   GitHub    │  SOPS-encrypted   │ Server at runtime │
│                               │   Actions   │  (in git repo)    │ (plain .env)      │
├───────────────────────────────┼─────────────┼───────────────────┼───────────────────┤
│ DEPLOY_SSH_KEY                │     Yes     │        -          │        -          │
│ DEPLOY_HOST                   │     Yes     │        -          │        -          │
│ DEPLOY_USER                   │     Yes     │        -          │        -          │
│ AGE_SECRET_KEY                │     Yes     │        -          │   Yes (.age.key)  │
│ GITHUB_TOKEN                  │  Automatic  │        -          │        -          │
├───────────────────────────────┼─────────────┼───────────────────┼───────────────────┤
│ JWT_ACCESS_SECRET             │      -      │       Yes         │   Decrypted       │
│ JWT_REFRESH_SECRET            │      -      │       Yes         │   Decrypted       │
│ ENCRYPTION_KEY                │      -      │       Yes         │   Decrypted       │
│ AZURE_OPENAI_API_KEY          │      -      │       Yes         │   Decrypted       │
│ AZURE_OPENAI_ENDPOINT         │      -      │       Yes         │   Decrypted       │
│ NOTION_CLIENT_ID              │      -      │       Yes         │   Decrypted       │
│ NOTION_CLIENT_SECRET          │      -      │       Yes         │   Decrypted       │
├───────────────────────────────┼─────────────┼───────────────────┼───────────────────┤
│ MONGODB_URI (Atlas)           │      -      │       Yes         │   Decrypted       │
│ REDIS_URL (Redis Cloud)       │      -      │       Yes         │   Decrypted       │
│ QDRANT_URL (Qdrant Cloud)     │      -      │       Yes         │   Decrypted       │
│ QDRANT_API_KEY (Qdrant Cloud) │      -      │       Yes         │   Decrypted       │
└───────────────────────────────┴─────────────┴───────────────────┴───────────────────┘
```

---

## Appendix B — Resource Budget

**Droplet: s-2vcpu-4gb (~$24/mo)**

MongoDB, Redis, and Qdrant run as **external managed services** (free tiers),
not on the droplet. Only 3 containers run locally.

```
┌─────────────────────────┬───────────┬───────────┐
│        Service          │ RAM Limit │ CPU Limit │
├─────────────────────────┼───────────┼───────────┤
│ Frontend (Next.js)      │   512 MB  │    0.5    │
│ Backend (Node.js)       │  1536 MB  │    1.0    │
│ RAGAS (Python)          │   768 MB  │    0.5    │
├─────────────────────────┼───────────┼───────────┤
│ Containers Total        │  2816 MB  │    2.0    │
│ OS + Nginx overhead     │ ~1184 MB  │    0.0    │
├─────────────────────────┼───────────┼───────────┤
│ TOTAL                   │  4000 MB  │    2.0    │
└─────────────────────────┴───────────┴───────────┘

External Managed Services (FREE tiers):
┌─────────────────────────┬───────────────────────────┬────────┐
│        Service          │       Plan                │  Cost  │
├─────────────────────────┼───────────────────────────┼────────┤
│ MongoDB Atlas           │ M0 Free (512MB storage)   │  $0/mo │
│ Redis Cloud             │ Free (30MB, 30 conns)     │  $0/mo │
│ Qdrant Cloud            │ Free (1GB, 1 cluster)     │  $0/mo │
└─────────────────────────┴───────────────────────────┴────────┘
```

**Monthly cost estimate:**

| Item | Cost |
|------|------|
| DigitalOcean Droplet (4GB) | ~$24/mo |
| Azure OpenAI (embeddings + LLM) | ~$11-15/mo |
| MongoDB Atlas (M0 Free) | $0 |
| Redis Cloud (Free) | $0 |
| Qdrant Cloud (Free) | $0 |
| Domain name (devandre.sbs) | $1.74/year |
| **Total** | **~$36-40/mo** |

---

## Appendix C — Rollback Procedures

### Rollback to previous images

```bash
ssh deploy@<droplet-ip>
cd /opt/rag

# List available image tags
docker images | grep ghcr.io

# Edit compose to pin a specific SHA tag instead of :latest
# Or pull a specific tag:
docker pull ghcr.io/<owner>/retrieva/backend:<previous-sha>
docker tag ghcr.io/<owner>/retrieva/backend:<previous-sha> ghcr.io/<owner>/retrieva/backend:latest

# Restart
docker compose -f docker-compose.production.yml up -d
```

### Rollback env vars

```bash
# Encrypted env files are in git history
git log --oneline backend/.env.production.enc

# Checkout a previous version
git checkout <commit-sha> -- backend/.env.production.enc

# Decrypt and restart
export SOPS_AGE_KEY_FILE=/opt/rag/.age.key
sops --decrypt backend/.env.production.enc > backend/.env
docker compose -f docker-compose.production.yml restart backend
```

### Emergency: restart all services

```bash
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d
```

### Nuclear option: rebuild from scratch

```bash
docker compose -f docker-compose.production.yml down -v  # WARNING: deletes volumes/data
docker system prune -af
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

---

## Appendix D — Files Created / Modified

```
┌───────────────────────────────────────────┬──────────┬───────────────────────────────────────┐
│                  File                     │  Action  │              Purpose                  │
├───────────────────────────────────────────┼──────────┼───────────────────────────────────────┤
│ frontend/Dockerfile                       │  Create  │ Next.js multi-stage build             │
│ docker-compose.production.yml             │  Create  │ 3 services, GHCR images, limits       │
│ nginx/rag.conf                            │  Create  │ Reverse proxy + SSL config            │
│ .sops.yaml                                │  Create  │ SOPS encryption rules                 │
│ backend/.env.production.enc               │  Create  │ Encrypted backend secrets             │
│ frontend/.env.production.enc              │  Create  │ Encrypted frontend env                │
│ ragas-service/.env.production.enc         │  Create  │ Encrypted RAGAS env                   │
│ infra/digitalocean/providers.tf           │  Create  │ DO provider config                    │
│ infra/digitalocean/variables.tf           │  Create  │ Terraform variables                   │
│ infra/digitalocean/main.tf                │  Create  │ Droplet + firewall + project          │
│ infra/digitalocean/dns.tf                 │  Create  │ Domain + A records                    │
│ infra/digitalocean/outputs.tf             │  Create  │ Droplet IP, SSH command               │
│ infra/digitalocean/user-data.sh           │  Create  │ Cloud-init bootstrap script           │
│ infra/digitalocean/terraform.tfvars.example│  Create │ Example Terraform config              │
│ infra/azure/ (move existing)              │ Refactor │ Move infra/*.tf → infra/azure/*.tf    │
│ .github/workflows/ci.yml                  │  Modify  │ Add frontend-test + all docker builds │
│ .github/workflows/cd.yml                  │  Modify  │ Add frontend build + SSH deploy       │
│ .gitignore                                │  Modify  │ Add env + terraform exclusions        │
└───────────────────────────────────────────┴──────────┴───────────────────────────────────────┘
```

### Execution Order

```
Phase 1 → Create files in codebase (Dockerfiles, compose, nginx, terraform)
Phase 2 → Set up SOPS + age, encrypt env files, commit
Phase 3 → Run terraform apply (creates the server)
Phase 4 → Set up GitHub Secrets + update CI/CD pipelines
Phase 5 → First manual deploy (clone, decrypt, docker up)
Phase 6 → Nginx + SSL on the server
Phase 7 → Smoke test everything
Phase 8 → Backups, monitoring, hardening
```

After Phase 8, all future deployments are automatic:
**push to main → CI tests → build images → push GHCR → SSH deploy → health check**
