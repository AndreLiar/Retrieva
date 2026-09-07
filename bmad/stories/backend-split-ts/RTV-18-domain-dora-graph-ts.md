---
id: RTV-18-domain-dora-graph-ts
title: "Convert domain models + the DORA graph to strict TypeScript (Zod z.infer)"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 8
labels: [typescript, backend, domain-logic, database, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **Backend Developer**, I want the domain models and the DORA relational graph typed in strict TypeScript so that entity→contract→function→subprocessor integrity is enforced at compile time, not just at runtime.

## Background

The DORA graph is the product thesis — the relational integrity spreadsheets can't model. It's exactly where an untyped `any` silently corrupts data. Zod is already a dependency, so schemas become the single source of truth via `z.infer` (no duplicate type + validator). Mongoose models get typed too.

## Acceptance Criteria

- [ ] AC-1: All `models/*.js` → `.ts`; each Mongoose schema typed (interface or `InferSchemaType`), exported document/model types.
- [ ] AC-2: DORA graph entities (entity, ICT third-party service, contractual arrangement / RT.02.01 fields, function, subprocessor/nth-party) modelled as explicit TypeScript types; relationships typed (no `any` on graph edges).
- [ ] AC-3: Existing Zod schemas are the DTO source of truth — request/response DTO types derived via `z.infer<typeof schema>`; no hand-written duplicate of a Zod-validated shape.
- [ ] AC-4: `strict: true` (or at least `strictNullChecks` + `noImplicitAny`) enforced **for the `models/` + domain directories** via tsconfig `include`/overrides, without breaking the still-JS rest.
- [ ] AC-5: vitest for domain logic stays green; new type-level assertions where useful (e.g. `expectTypeOf`).

## Technical Notes

- Convert leaf models first (no cross-model deps), then aggregates.
- Where a Zod schema and a Mongoose schema describe the same entity, keep ONE canonical shape and derive the other.
- Don't boil the ocean on strict for the whole repo here — scope strict to the converted dirs; repo-wide strict is RTV-21.

## Definition of Done

- [ ] All ACs met; `tsc --noEmit` green; domain vitest green
- [ ] No `any` on DORA graph types (grep clean or justified `// eslint-disable` with reason)
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Convert `models/*.js` → typed `.ts`
- [ ] Model the DORA graph entities + relationships as TS types
- [ ] Derive DTO types from existing Zod schemas (`z.infer`)
- [ ] Scope strict to domain dirs; keep vitest green

## Dependencies

- Depends on: RTV-17
- Blocks: RTV-19, RTV-20
