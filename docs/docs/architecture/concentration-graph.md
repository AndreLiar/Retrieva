---
sidebar_position: 9
---

# Concentration & nth-party Graph — Design (ADR)

**Status:** Proposed → Phase 1 in progress · **Tracking:** `platform-backlog` RTV-15 · **Date:** 2026-09-05

## Context

retrieva assesses vendors one-at-a-time (documents → DORA control mapping → risk score
→ Register of Information). But DORA's core question is **cross-vendor**: *if a provider
— or its sub-provider — fails, which business functions stop, and where is the firm
over-concentrated?* (Art 28(4) concentration assessment; Art 29 systemic CTPPs). A
per-vendor questionnaire fundamentally cannot answer this — it is a **graph** problem.

Today the data model has the provider node but not the graph:

- **Organization** = the financial entity.
- **Workspace** = a vendor/provider being assessed (`vendorTier: critical|important|standard`, `country`, `exitStrategyDoc`, certifications). → **this is the Provider node.**
- **Missing:** the *Critical or Important Function* (CIF) primitive, and *sub-provider (nth-party) edges* (Azure→…, OpenAI→Azure).

## Decision

Add an **org-scoped dependency graph** on top of the existing workspaces:

```
CriticalFunction ──depends_on──▶ Provider(=Workspace) ──sub_processes_via──▶ SubProvider (nth-party)
  "Claims processing"              Azure / OpenAI                              Azure infra, …
  criticality: critical
```

**Two new entities (org-scoped):**

- **`CriticalFunction`** — `{ organizationId, name, criticality: critical|important, dependsOn: [workspaceId], description }`. **Human-defined** — which functions rely on which providers is a firm-internal governance judgement the firm must own (not AI-inferred).
- **`ProviderDependency`** (edges) — `{ organizationId, parent: {kind: workspace|external, workspaceId?, name}, child: {name, tier}, source: manual|extracted, confidence }`. Captures nth-party chains where nodes may be assessed workspaces **or** external names (e.g. OpenAI→Azure, Azure not separately assessed).

**Sourcing (hybrid — chosen):** the firm defines CriticalFunctions + their provider
dependencies manually (governance act); sub-provider edges are **auto-extracted from the
subprocessor lists** already in vendor docs (reuse the existing LLM extraction) **with
human confirmation** (`source:extracted, confidence` → review). AI does the tedious
chain-mapping; the firm owns the risk model. AI never *infers* which business function
depends on a vendor (that would be a plausible-but-wrong compliance artifact).

## Concentration scoring (`concentrationService`)

Per provider, over the org graph:

- **Supported CIFs** — count of Critical Functions depending on the provider **directly + transitively** (via sub-provider edges), weighted by CIF criticality.
- **Single point of failure** — a CIF whose dependency on a provider (or a step in the chain) has no alternative → flag.
- **Shared-substrate concentration** — many distinct providers collapsing onto the **same** sub-provider (e.g. everything → Azure) → the Art 29 systemic signal.
- **Coverage %** — how much of the graph is populated, so scores are reported with honesty, never false confidence.

Outputs: a provider-level concentration score, an org-level "top concentration risks"
view, and an extension of the Register (RT.02.01) with the concentration/nth-party columns.

## Failure modes

- **Stale sub-provider lists** — vendors change subprocessors → tie re-extraction to the
  change-monitoring capability (a sibling gap); edges carry `lastVerifiedAt`.
- **Graph cycles** — guard traversal with a visited-set + depth cap.
- **Incomplete data** — never score as if complete; surface `coverage%` + which CIFs/edges
  are unmapped.
- **AI mis-extraction** — extracted edges are `confidence`-scored and require human
  confirmation before they affect a compliance score.

## Phasing

| Phase | Scope |
|---|---|
| **P1** (this) | `CriticalFunction` + `ProviderDependency` models (org-scoped) + `concentrationService` (graph build, transitive supported-CIFs, SPOF, shared-substrate, coverage%) + unit tests |
| P2 | API + auto-extract sub-provider edges from subprocessor lists (LLM, human-confirmed) + RT.02.01 extension |
| P3 | Interactive graph visualisation + concentration alerts (Art 29 thresholds) |

## Why this is the high-potential bet

Per-vendor assessment tooling is a commodity. A **continuously-updating enterprise
concentration + nth-party graph, tied to the regulator's own Register format**, answers
DORA's central question and is the moat competitors (questionnaire-first tools) can't
easily copy.
