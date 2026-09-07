# Retrieva — Backend repo split + TypeScript migration

**Product / board:** Retrieva — RNCP39583 Certification (Project #2)
**Initiative:** Certification
**Epic:** `retrieva-backend` (split the monorepo backend into its own repo + migrate JS→TS)
**Home repo:** `retrieva` (BMAD home — stories fan issues to member repos via frontmatter)
**Parent RFC:** andrelair-platform/retrieva#474
**Sprint start:** 2026-09-07
**Tech lead:** AndreLiar
**Total SP:** 44

---

## Sprint Goal

Split the Retrieva backend out of the monorepo into a dedicated **`retrieva-backend`** repo, and
migrate it from JavaScript (ESM, 236 files) to **TypeScript** — incrementally, guarded by the
existing vitest suite. Done as ONE coordinated move at the repo-split boundary (cheapest moment to
adopt `tsconfig`), leaving the frontend in `retrieva`. Sprint gate: **`retrieva-backend` builds a
strict-mode `tsc` image, deploys to dev via Kargo (Synced/Healthy), and prod is promotable.**

Why now: Zod is already a dependency (schemas → `z.infer` types for free); the domain is the DORA
graph (entity→contract→function→subprocessor) where types prevent silent data corruption; and it's
a certification signal (BC04 — optimiser & faire évoluer). See #474 + the Jan-2026 architecture note.

---

## Story Tracker

| ID | Title | SP | Status | Bloc |
|---|---|---|---|---|
| RTV-15 | Scaffold `retrieva-backend` repo + TS baseline (`allowJs`) | 3 | Ready | BC02 |
| RTV-16 | Migrate backend code into the new repo, green under `allowJs` | 5 | Ready | BC02 |
| RTV-17 | CI quality gates — `tsc --noEmit` + eslint + vitest | 2 | Ready | BC03 |
| RTV-18 | Convert domain models + DORA graph to strict TS (Zod `z.infer`) | 8 | Ready | BC02 |
| RTV-19 | Convert the Express layer (routes/controllers/middleware) to TS | 5 | Ready | BC02 |
| RTV-20 | Convert services/workers/integrations to TS (LangChain/BullMQ/socket.io/Stripe/Qdrant) | 8 | Ready | BC02 |
| RTV-21 | Enforce `strict` repo-wide; `tsc` build → `dist/`; prod Dockerfile | 5 | Ready | BC04 |
| RTV-22 | Deployment cutover — GitOps + Kargo for `retrieva-backend` | 5 | Ready | BC03 |
| RTV-23 | Docs + ADR + certification evidence (BC04) | 3 | Ready | BC04 |

**Progress:** 0 / 44 SP.

## Notes
- Issues are created in `retrieva` (the backend repo doesn't exist until RTV-15). Once
  `retrieva-backend` exists, later backend issues target it (`repo: andrelair-platform/retrieva-backend`).
- Blocs map to the #282 authoritative set (BC01 Piloter · BC02 Concevoir & développer ·
  BC03 Déployer & sécuriser · BC04 Optimiser & faire évoluer).
- Migration is incremental: `allowJs: true` + `strict: false` first, tighten per-directory, vitest
  guards each step. No big-bang rewrite.
