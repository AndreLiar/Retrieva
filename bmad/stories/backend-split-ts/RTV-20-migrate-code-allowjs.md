---
id: RTV-20-migrate-code-allowjs
title: "Move the backend into retrieva-backend, green under allowJs"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 5
labels: [typescript, backend, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **Backend Developer**, I want the existing backend code moved into `retrieva-backend` and compiling under `allowJs` so that the split is complete before any `.js`→`.ts` conversion begins.

## Background

The backend (`retrieva/backend/**`) moves wholesale, preserving git history where practical. Nothing is converted yet — this story proves the code runs unchanged in its new home with a TS compiler in `allowJs` mode. The vitest suite (unit + integration) is the safety net for the whole migration and must stay green from here on.

## Acceptance Criteria

- [ ] AC-1: `backend/**` (app.js, index.js, config/, controllers/, models/, middleware/, services/, workers/, migrations/, utils/, tests/) moved to `retrieva-backend`; history preserved via `git filter-repo`/subtree where feasible.
- [ ] AC-2: `npm ci` + `npm run typecheck` (`tsc --noEmit`, allowJs) exit 0 — JS files type-check loosely with no hard errors.
- [ ] AC-3: `npm run test` (vitest unit) + `npm run test:integration` pass (mongodb-memory-server + Redis as today).
- [ ] AC-4: `Dockerfile` builds and the container boots (`/health` 200) running the JS entrypoint (still `node index.js`; the `tsc` build comes in RTV-25).
- [ ] AC-5: `.env.example` + secret templates migrated; no secrets committed; `.env.production*.enc` handled per current SOPS/ESO flow.

## Technical Notes

- Keep `node --import ./instrument.js index.js` entrypoint (Sentry/OTel) working post-move.
- migrate-mongo config + `migrations/` come along; verify `migrate:status` runs.
- Frontend removal from `retrieva` (making it frontend-only) is tracked separately in RTV-26's cutover — this story only ADDS to the new repo.

## Definition of Done

- [ ] All ACs met; CI green (typecheck + vitest)
- [ ] Container boots and answers `/health`
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Move code (history-preserving) into `retrieva-backend`
- [ ] Fix any path/ESM breakage from the move
- [ ] Verify vitest unit + integration green
- [ ] Verify Dockerfile build + `/health`

## Dependencies

- Depends on: RTV-19
- Blocks: RTV-21, RTV-22
