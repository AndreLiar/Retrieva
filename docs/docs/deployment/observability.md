---
sidebar_position: 6
---

# Observability & Monitoring

Retrieva uses three complementary tools to provide full-stack observability in production:

| Tool | Purpose | What it covers |
|------|---------|----------------|
| **Sentry** | Error tracking & performance | Backend crashes, frontend JS errors, stack traces |
| **Netdata** | System & container metrics | CPU, RAM, disk, network, Docker container health |
| **UptimeRobot** | External uptime monitoring | Public endpoint availability from outside the server |

---

## Sentry

Sentry captures unhandled exceptions and performance data from both the backend (Node.js) and frontend (Next.js).

### Architecture

```
Backend (Node.js)
  instrument.js  ←  loaded via --import flag before any other module
  └─ Sentry.init()
       ├─ mongooseIntegration()   auto-instruments MongoDB queries
       ├─ redisIntegration()      auto-instruments Redis/IORedis commands
       └─ beforeSend()            filters out expected 4xx operational errors

Frontend (Next.js)
  sentry.client.config.ts   ←  browser errors
  sentry.server.config.ts   ←  SSR errors
  sentry.edge.config.ts     ←  Edge runtime errors
```

### Configuration

| Variable | Where set | Description |
|----------|-----------|-------------|
| `SENTRY_DSN` | `backend/.env.production.enc` | Backend DSN (server-side only) |
| `NEXT_PUBLIC_SENTRY_DSN` | CD workflow build args | Frontend DSN (baked into the JS bundle at build time) |

### Using the Sentry Dashboard

1. Go to **sentry.io** → your organization → select the **backend** or **frontend** project
2. **Issues** tab — lists all unhandled errors grouped by type. Each issue shows:
   - Full stack trace with source context
   - Request URL, method, and headers
   - User/session context
   - Environment tag (production/development)
3. **Performance** tab — shows transaction traces and slow endpoints (sampled at 10% in production to stay within the free tier)

### Setting Up Alerts

1. In your Sentry project: **Alerts → Create Alert Rule**
2. Recommended rules:
   - **New issue**: triggers when a brand-new error type is first seen
   - **Issue frequency**: triggers when an existing error spikes (e.g. >10 events in 1 hour)
3. Add your email as the alert target under **Settings → Notifications**

### Filtering

The `beforeSend` hook in `backend/instrument.js` silently drops events where `err.isOperational === true`. These are expected business errors (validation failures, 404s, 401s) handled by the app — only real crashes reach Sentry.

---

## Netdata

Netdata is a real-time system monitoring agent running directly on the production DigitalOcean droplet. It collects metrics every second for CPU, memory, disk, network, and Docker containers.

### Connecting to Netdata Cloud

Netdata Cloud provides a web UI to view metrics without SSH access.

1. Go to **app.netdata.cloud** and sign in (free account)
2. Click **Connect Nodes** → copy the provided claim command (looks like):
   ```bash
   wget -O /tmp/netdata-kickstart.sh https://my-netdata.io/kickstart.sh
   sudo bash /tmp/netdata-kickstart.sh --claim-token <TOKEN> --claim-url https://app.netdata.cloud
   ```
3. SSH into the production server and run the command:
   ```bash
   ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155
   # paste and run the claim command
   ```
4. The node appears in Netdata Cloud within ~30 seconds

### Key Dashboards

Once connected, navigate to your node in Netdata Cloud:

| Section | What to watch |
|---------|---------------|
| **System Overview** | CPU usage, load average, memory utilization |
| **Disk I/O** | Write/read throughput — spike indicates DB pressure |
| **Net** | Incoming/outgoing bytes per interface |
| **Docker** | Per-container CPU and memory (backend, frontend, redis, qdrant) |
| **Apps** | Node.js process memory and CPU |

### Alerts

Netdata ships with built-in alert rules (high CPU, low disk space, memory pressure). To customize:
```bash
ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155
sudo nano /etc/netdata/health.d/custom.conf
```

### Checking Netdata Locally (without Cloud)

```bash
ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155 -L 19999:localhost:19999
# then open http://localhost:19999 in your browser
```

---

## UptimeRobot

UptimeRobot pings your public endpoint from external servers every 5 minutes and alerts you if the site is unreachable (e.g. server crashed, Nginx down, DNS issue). This catches outages that Netdata and Sentry would miss because they run on the same server.

### Setting Up a Monitor

1. Go to **uptimerobot.com** → create a free account
2. Click **Add New Monitor**:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: `Retrieva Production`
   - **URL**: `https://retrieva.online/health`
   - **Monitoring Interval**: 5 minutes
3. Under **Alert Contacts**, add your email address
4. Click **Create Monitor**

### What UptimeRobot Checks

The `/health` endpoint returns a JSON response:
```json
{
  "status": "success",
  "message": "Service is healthy",
  "data": {
    "status": "up",
    "uptime": 3281,
    "email": { "configured": true }
  }
}
```

UptimeRobot considers the site **down** if it gets a non-2xx response or a connection timeout.

### Maintenance Windows

Before planned maintenance (e.g. major deploys):
1. In UptimeRobot: **My Monitors → your monitor → Maintenance Windows**
2. Add a window to suppress alerts during the expected downtime

---

## Runbook: What to do when something is wrong

### Backend health check fails in CD

The CD pipeline checks `http://localhost:3007/health` and rolls back if it fails. If you see a rollback:

1. Check the CD run logs in GitHub Actions — the deploy step now prints the last 100 lines of backend container logs on failure
2. SSH in and inspect: `docker logs retrieva-backend --tail 200`
3. Common causes:
   - Missing environment variable → check `backend/.env.production.enc` decryption
   - Module import error → check if a file was deleted without removing its import
   - Database connection refused → check `docker compose ps` for MongoDB/Redis/Qdrant

### UptimeRobot alert fires

```bash
ssh -i ~/.ssh/retrieva_deploy deploy@164.90.211.155
curl -s http://localhost:3007/health   # check if backend is up internally
curl -I http://localhost:3000          # check if frontend is up
sudo systemctl status nginx            # check if Nginx is running
docker compose -f /opt/rag/docker-compose.production.yml ps  # check all containers
```

### Sentry shows a spike in errors

1. In Sentry, click the issue → examine the stack trace
2. Check if the error is in a specific route or worker
3. View backend logs: `docker compose -f /opt/rag/docker-compose.production.yml logs -f backend --tail 100`
4. If critical, roll back to the previous image:
   ```bash
   docker tag ghcr.io/andreliar/retrieva/backend:rollback ghcr.io/andreliar/retrieva/backend:latest
   docker compose -f /opt/rag/docker-compose.production.yml up -d backend
   ```

### High memory / CPU (Netdata alert)

```bash
# Check which container is consuming resources
docker stats --no-stream

# Restart a specific service
docker compose -f /opt/rag/docker-compose.production.yml restart backend

# Check disk space
df -h
docker image prune -f   # clean up old images
```
