# Retrieva → Kargo: runtime-config migration (scoped story)

**Status:** Planned (not started). **Why it's a story, not a quick edit:** retrieva is
**live at retrieva.online**, and this touches the client bundle — it must be built,
deployed to `retrieva-dev`, and browser-verified before any prod promotion.

## Problem

Kargo promotes **one immutable artifact** across stages. Retrieva's frontend bakes
`NEXT_PUBLIC_API_URL` (and `NEXT_PUBLIC_WS_URL`) into the **client bundle at build
time**, so the dev image and prod image are *different artifacts* (dev → Harbor
`dev-*`, prod → ghcr SHA). There is nothing to promote dev→prod. Fix: make the API/WS
URLs **runtime** config so a single image runs in both envs.

- Framework: **Next.js 16, App Router, `output: standalone`** (`node server.js`).
- Env-specific baked vars: **`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`** (differ per env).
- Constant baked vars (leave as build ARG): `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SENTRY_DSN`.
- 9 non-test usages in `frontend/src/` (client + server).

## Approach: `/__env.js` route handler + `getRuntimeEnv()`

A Next.js **route handler** runs on the server at request time, so it reads
`process.env` at **runtime** (container env), not build. It emits a tiny script that
sets `window.__ENV__`; the client reads from there. Keeps the current baked value as a
**fallback** so a misconfigured deploy degrades to today's behaviour, not a hard break.

## File-by-file changes

### frontend (retrieva repo)

1. **`frontend/src/app/__env.js/route.ts`** (new) — dynamic route handler:
   ```ts
   export const dynamic = 'force-dynamic';
   export async function GET() {
     const api = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';
     const ws  = process.env.WS_URL  ?? process.env.NEXT_PUBLIC_WS_URL  ?? '';
     const body = `window.__ENV__=${JSON.stringify({ API_URL: api, WS_URL: ws })};`;
     return new Response(body, {
       headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' },
     });
   }
   ```

2. **`frontend/src/lib/runtime-env.ts`** (new) — single accessor with safe fallback:
   ```ts
   export function getApiUrl(): string {
     if (typeof window !== 'undefined' && window.__ENV__?.API_URL) return window.__ENV__.API_URL;
     return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3007/api/v1';
   }
   export function getWsUrl(): string { /* same shape for WS_URL */ }
   ```
   Add a `declare global { interface Window { __ENV__?: { API_URL?: string; WS_URL?: string } } }`.

3. **`frontend/src/app/layout.tsx`** — load the runtime env BEFORE the app hydrates:
   `<head>` → `<script src="/__env.js" />` (a plain sync script tag; it must run before
   client code reads `window.__ENV__`).

4. **Replace the 9 usages** of `process.env.NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`
   with `getApiUrl()` / `getWsUrl()`:
   - `src/lib/api/client.ts` (axios baseURL)
   - `src/features/chat/api/rag.ts` (×2), `src/features/chat/hooks/use-streaming.ts`
   - `src/features/questionnaires/api/questionnaires.ts`,
     `src/features/questionnaires/components/{questionnaires-page,questionnaire-detail-page}.tsx`
   - `src/shared/server/auth-session.ts` (server — resolves to `process.env.API_URL`)
   - Keep `src/tests/rag-api.test.ts` working (point it at `getApiUrl` + stub `window.__ENV__`).

5. **`frontend/Dockerfile`** — drop the `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`
   build ARGs/ENVs (keep `APP_NAME`, `SENTRY_DSN`). The image no longer bakes an env.

### CI (retrieva repo, `.github/workflows/build.yml`)

6. Build **one** frontend image (no per-env `NEXT_PUBLIC_API_URL` build-arg). On `main`,
   dual-push `harbor…/retrieva-frontend:<sha>` **and** `ghcr…/retrieva-frontend:<sha>`
   (immutable), sign + SBOM — mirror the platform-demo/ktayl pattern. Backend is already
   env-agnostic; same dual-push. Drop the branch-aware per-env image build.

### gitops (minicloud-gitops)

7. **`services/retrieva/minicloud-1/dev` & `/prod`** — both overlays use the **same**
   ghcr image (backend + frontend), and set the env on the frontend Deployment:
   - dev:  `API_URL=https://retrieva-dev.10.0.0.200.nip.io/api/v1`, matching `WS_URL`
   - prod: `API_URL=https://retrieva.online/api/v1`, matching `WS_URL`
   (via a `patch` or the existing externalsecret/env mechanism). prod keeps `newName: ghcr`.
   Add the `ghcr-pull` imagePullSecret if the retrieva-frontend/backend packages are Internal.

8. **`services/retrieva/kargo/`** — replace the parked README with a real pipeline
   (copy `services/ktayl-policy-service/kargo/`, adapt names). **Two image subscriptions**
   in the Warehouse (`retrieva-backend`, `retrieva-frontend`), and the prod Stage's
   `kustomize-set-image` sets both with their ghcr `newName`. Add `retrieva` to the
   AppProject destinations (already present) and **remove the retrieva exclude** in
   `apps/platform/kargo-projects.yaml`.

## Dev-first verification (mandatory before prod)

1. Land 1–6 on a retrieva branch → CI builds the single image → deploy to `retrieva-dev`.
2. In a browser on `https://retrieva-dev.10.0.0.200.nip.io`: confirm `/__env.js` returns
   the dev API URL, `window.__ENV__.API_URL` is set, chat streaming + questionnaires hit
   the dev backend, login works. Check no console errors, no calls to `localhost:3007`.
3. Only then merge the gitops overlays + Kargo pipeline. **Prod (retrieva.online) is
   switched solely via the CODEOWNERS-gated Kargo prod PR** — never a direct push.

## Rollback

The `getApiUrl()` fallback to the (still-present) `NEXT_PUBLIC_*` build value means a
failed `/__env.js` degrades to prior behaviour. Full rollback = revert the gitops prod
PR; ArgoCD selfHeals prod to the previous ghcr SHA.
