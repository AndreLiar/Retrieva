---
id: RTV-15-scaffold-backend-repo
title: "Scaffold retrieva-backend repo with a TypeScript baseline (allowJs)"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 3
labels: [typescript, backend, ci, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As the **Tech Lead**, I want a standardised, TypeScript-ready `retrieva-backend` repository so that all migration work lands on a consistent, buildable base from day one.

## Background

Split from the monorepo (RFC #474): the backend moves to its own repo; `retrieva` becomes frontend-only. This is also the cheapest moment to adopt TypeScript (a fresh `tsconfig` vs retrofitting). The backend is Node ESM (`"type": "module"`, 236 files), Express + Mongoose + LangChain, with Zod already a dependency.

## Acceptance Criteria

- [ ] AC-1: `andrelair-platform/retrieva-backend` created, standardised per `conventions.md` (About/description/homepage/topics, README, LICENSE MIT, CONTRIBUTING, release-please `release-type: node`).
- [ ] AC-2: `tsconfig.json` present — `allowJs: true`, `checkJs: false`, `strict: false` (tightened later), `module: nodenext`, `moduleResolution: nodenext`, `outDir: dist`, `target: ES2022`.
- [ ] AC-3: `typescript`, `@types/node`, `@types/express` + other `@types/*` added as devDeps; `npm run typecheck` = `tsc --noEmit` exits 0 on the empty/baseline tree.
- [ ] AC-4: GitHub Pages docs site (`website/`) scaffolded per the per-repo Docusaurus standard.
- [ ] AC-5: BMAD caller workflow `.github/workflows/bmad-sync.yml` added (uses the org-shared reusable), and `_bmad/`, `_bmad-output/`, `dist/`, `node_modules/` git-ignored.

## Technical Notes

- NodeNext gotcha: relative imports need explicit `.js` extensions even in `.ts` source — document it in CONTRIBUTING.
- Do NOT enable `strict` yet — that would make AC-3 impossible before any conversion. Strict comes in RTV-21.
- Keep the repo Node-ESM (matches current backend) — no CommonJS regression.

## Definition of Done

- [ ] All ACs met
- [ ] `npm run typecheck` + `npm run lint` green on the baseline
- [ ] Repo standardisation checklist (`conventions.md`) complete
- [ ] Issue moved to Done; SPRINT-OVERVIEW tracker updated

## Tasks

- [ ] Create repo + `gh api` About/topics + GitHub Pages enable
- [ ] Add `tsconfig.json`, TS devDeps, `typecheck`/`lint`/`build` scripts
- [ ] Add README/LICENSE/CONTRIBUTING/release-please files
- [ ] Add BMAD caller workflow + `.gitignore`

## Dependencies

- Depends on: #474 (RFC decision to split)
- Blocks: RTV-16
