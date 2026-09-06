---
sidebar_position: 1
---

# Retrieva — YC one-pager

**AI-Native Compliance Infrastructure for financial entities.**
*Category (YC Fall 2026 RFS): AI-Native Compliance Infrastructure.*

---

## One-liner

**Retrieva is the AI compliance officer for DORA third-party ICT risk** — it reads a financial
entity's vendor contracts, security evidence and subprocessor chains, and continuously produces the
risk assessments, concentration analysis and Register of Information the regulator requires. What a
compliance team does across weeks of spreadsheets, Retrieva does continuously — with a human owning
every decision and a full audit trail behind it.

## The problem

**DORA is mandatory, hard, and manual.** Since 17 January 2025, every EU financial entity (banks,
insurers, investment firms, fintechs) must run **continuous ICT third-party risk management** under
the Digital Operational Resilience Act: assess every ICT provider, map nth-party subprocessor chains,
identify concentration risk (Art. 28–29), maintain a machine-readable **Register of Information**
(EBA RT.02.01), and keep exit strategies for critical providers.

Today this is stitched together with spreadsheets, siloed GRC tools, expensive consultants and a
Chief Compliance Officer's headcount — **and the cost grows faster than the business.** It is exactly
the AI-native problem the YC RFS describes: monitoring regulatory change, flagging anomalies,
generating reports, keeping audit trails, across a jurisdictional patchwork.

## The product

Retrieva ingests the documents a firm already has (contracts, SOC 2 / ISO reports, DPAs,
subprocessor lists — including scanned and chart-heavy PDFs via multimodal ingestion) and:

- **Assesses** each vendor against the DORA control set (RAG over a curated DORA knowledge base).
- **Maps the graph** — critical/important functions → providers → nth-party subprocessors — and
  surfaces **concentration risk** (everyone on the same cloud) and **single points of failure**.
- **Generates the Register of Information** (RT.02.01) and audit-ready reports.
- **Keeps a human in the loop** — every AI-extracted edge or risk decision is confidence-scored and
  ratified by a person before it affects a compliance artifact.

Governed autonomy, not a chatbot: every model call is logged (audit trail), access is policy-gated,
and the human owns accountability.

## Why now

- **DORA is in force** (Jan 2025) and enforcement is ramping — demand is regulator-mandated, not
  discretionary.
- **The EU AI Act** adds AI-governance obligations on top — the same buyers, the same year.
- **Intelligence got good enough** — multimodal document understanding + RAG can now read the
  evidence base a firm actually has, not a clean API.

## Go-to-market: France first → EU → world (incl. USA)

**Phase 1 — France (beachhead).** French financial entities are supervised for DORA by the **ACPR**
(and AMF). We start here because the demand is mandatory, the language and regulatory context are
ours, and the buyer (DSI / RSSI / conformité) is reachable. Land mid-size insurers, banks and
fintechs that must comply but can't justify a large GRC build.

**Phase 2 — European Union.** DORA is a **single EU regulation** — the same product serves all 27
member states with only language + local-authority nuances (e.g. **BaFin** in Germany). One
regulatory engine, a continent of buyers.

**Phase 3 — World, including the USA.** The core primitive — *a continuously-updated third-party /
nth-party risk graph tied to a regulator's register format* — generalizes. We map the same engine to
adjacent regimes: **US TPRM** (OCC / FFIEC third-party risk guidance, NYDFS 500), **UK** operational
resilience (PRA/FCA SS1/21), and the broader global vendor-risk market. Start where the law forces
adoption (France/EU), then export the engine to jurisdictions that need the same capability.

## Why us — the moat

- **DORA-native, not GRC-generic.** The concentration + nth-party graph tied to the RT.02.01
  register is the regulator's own hard question — competitors selling questionnaires can't easily
  copy it.
- **Governed autonomy by construction.** Retrieva runs on a full AI operating platform (LiteLLM
  gateway with EU residency, Langfuse audit trail, policy-gated access, human-in-the-loop). In
  regulated finance, *auditable + compliant by construction* is the only sellable form of AI.
- **Already built and live.** Retrieva runs in dev + prod today (multi-tenant, enterprise security,
  multimodal ingestion, the concentration graph) — a working product, not a deck.

## The wedge → the vision

Retrieva starts as **compliance infrastructure**, but ICT third-party risk is the entry point to a
larger arc: the **governance layer of the AI-native insurer** — a machine-first, human-governed
operating model where AI runs the operational company and humans own the decisions. Compliance is
the wedge with mandatory demand; the operating model is the expansion. *(See the AI-First Insurance
Operating Model vision.)*

## Status & the ask

- **Live** at retrieva.online (dev + prod), multi-tenant, DORA knowledge base, concentration graph,
  Register of Information, multimodal ingestion, full LLMOps observability.
- Serves double duty as the author's RNCP39583 certification project — battle-tested, documented.
- **The ask:** YC — to turn a working, regulation-mandated product into the compliance infrastructure
  every EU (then global) financial entity runs on.
