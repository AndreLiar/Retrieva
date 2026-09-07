---
id: RTV-21-strict-build
title: "Enforce strict mode repo-wide; tsc build → dist/; prod Dockerfile"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 5
labels: [typescript, backend, ci, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As the **Tech Lead**, I want the whole backend to compile under `strict` and ship a built artifact so that the migration's guarantees are real in production, not just in the editor.

## Background

With every file converted (RTV-18/19/20), we remove the `allowJs` scaffolding, flip `strict: true` globally, and switch the runtime from `node index.js` (JS) to a `tsc`-built `dist/`. This is the point where TypeScript's value is fully banked.

## Acceptance Criteria

- [ ] AC-1: No `.js` source remains under `src/` (scripts/config excepted if justified); `allowJs` removed from tsconfig.
- [ ] AC-2: `strict: true` (incl. `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` if feasible) — `tsc --noEmit` green repo-wide.
- [ ] AC-3: `npm run build` = `tsc` → `dist/`; entrypoint becomes `node --import ./dist/instrument.js dist/index.js`.
- [ ] AC-4: Multi-stage `Dockerfile` — builder stage runs `tsc`, runtime stage carries only `dist/` + prod deps; image boots, `/health` 200; image is env-agnostic (runtime config, no baked env).
- [ ] AC-5: Every `@ts-expect-error`/`eslint-disable` has an inline justification comment (per `testing.md` rule 5); count tracked and minimised.

## Technical Notes

- Turn on strict per-directory in earlier stories where possible so this is a final flip, not a wall of errors.
- Keep the ghcr/SHA immutable prod tag pattern (Kargo prerequisite) — no `:latest`.
- Node type-stripping is NOT a substitute for a build here — `dist/` is deterministic and portable.

## Definition of Done

- [ ] All ACs met; strict `tsc --noEmit` green; container boots from `dist/`
- [ ] Full vitest suite green against built output
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Remove `allowJs`; flip `strict: true`; fix residual errors
- [ ] Add `tsc` build + `dist/` entrypoint
- [ ] Multi-stage Dockerfile (builder → slim runtime)
- [ ] Audit + justify remaining suppressions

## Dependencies

- Depends on: RTV-19, RTV-20
- Blocks: RTV-22
