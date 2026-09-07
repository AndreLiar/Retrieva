---
id: RTV-23-docs-adr-cert-evidence
title: "Docs + ADR + certification evidence for the split & TS migration"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 3
labels: [typescript, docs, cert, retrieva]
priority: Should
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As the **owner defending RNCP39583**, I want the repo split and JS→TS migration documented as an ADR and certification evidence so that it stands up in an architecture review and the diploma defence.

## Background

Per `documentation.md`, no workstream is done until its written trace reflects reality. This is also BC04 (*optimiser & faire évoluer*) evidence: a deliberate maintainability/type-safety decision on a live, compliance-critical product, with the "why" recorded.

## Acceptance Criteria

- [ ] AC-1: ADR in `retrieva-backend` docs — "Split backend to its own repo" + "Adopt TypeScript" (context, options, decision, consequences, the incremental `allowJs`→strict approach).
- [ ] AC-2: Certification evidence page under `retrieva/docs/docs/certification/` (BC04) — before/after (236 JS files → strict TS), the type-safety rationale (DORA graph integrity, Zod `z.infer`), and the CI `tsc` gate as a quality control.
- [ ] AC-3: `minicloud-platform-docs` overview updated with the new `retrieva-backend` repo + link to its docs site (the map points to the new library).
- [ ] AC-4: RFC #474 closed with a summary + links; SPRINT-OVERVIEW tracker finalised.
- [ ] AC-5: Docs sites build clean (`npm run build`, both locales where applicable).

## Technical Notes

- Keep cert artefacts in Retrieva's OWN docs, never in ktayl/minicloud docs (two-layer rule).
- Link the ADR from the certification overview index.

## Definition of Done

- [ ] All ACs met; docs build green; #474 closed
- [ ] Issue Done; tracker at 44/44

## Tasks

- [ ] Write the ADR (split + TS)
- [ ] Write the BC04 certification evidence page
- [ ] Update the org docs map + close #474
- [ ] Build-check docs sites

## Dependencies

- Depends on: RTV-22
- Blocks: none (sprint close)
