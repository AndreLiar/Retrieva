---
id: RTV-17-ci-quality-gates
title: "CI quality gates — tsc --noEmit + eslint + vitest"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 2
labels: [typescript, ci, testing, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **DevOps Engineer**, I want CI to fail on type errors, lint errors, or test failures so that the migration can proceed safely one file at a time without regressions shipping.

## Background

Type-stripping at runtime (Node 24) erases types but does not *check* them — so `tsc --noEmit` is the gate that gives TypeScript its value. This wires the org testing standard (L0 static + L1 unit, `testing.md`) for the new repo, with type-checking added to L0.

## Acceptance Criteria

- [ ] AC-1: CI workflow runs, in order (fail-fast): `eslint` → `tsc --noEmit` (L0) → `vitest` unit w/ coverage (L1); L2 integration on PR to main.
- [ ] AC-2: `tsc --noEmit` is **blocking** (a type error fails the build) — even while `strict:false`.
- [ ] AC-3: Coverage threshold ≥ 70% on business-logic files (per `testing.md`).
- [ ] AC-4: Harbor(dev)+ghcr(prod-SHA) dual-push retained (org CI/registry standard); cosign + SBOM on main.
- [ ] AC-5: husky pre-commit (eslint) + commit-msg (commitlint conventional) preserved.

## Technical Notes

- Keep the existing 5-layer mapping; only ADD `tsc --noEmit` to L0.
- Delete any stale repo-level `HARBOR_*` secrets that would shadow the org secrets (recurring trap).

## Definition of Done

- [ ] All ACs met; a deliberately-introduced type error fails CI (proven then reverted)
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Add `typecheck` job (blocking) to CI
- [ ] Wire eslint + vitest + coverage gate
- [ ] Confirm dual-push + cosign/SBOM on main
- [ ] Prove the gate fails on a type error

## Dependencies

- Depends on: RTV-16
- Blocks: RTV-18 (safe conversion needs the gate)
