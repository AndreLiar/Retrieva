---
sidebar_position: 2
---

# Who it's for & how it helps

Retrieva targets **EU financial entities** bound by DORA (Regulation (EU) 2022/2554, in force since **17 January 2025**): banks, insurers, payments / PSPs, and asset managers. The product is shaped around the third-party ICT risk pillar of DORA and replaces six different manual workflows with one auditable platform.

## Concrete pains it solves

### 1. Vendor onboarding: weeks → hours

Before Retrieva, a legal or compliance team manually reads vendor ICT documentation (often 100+ pages), scores it against Art. 28 obligations, and drafts a memo. The Retrieva gap-analysis pipeline ingests the docs, maps every chunk to specific DORA articles, and produces a structured report with citations — typically in **2–5 minutes**. The compliance officer reviews; they don't write from scratch.

Pipeline: multi-query expansion + HyDE generate multiple search vectors → Qdrant retrieval (k=15) filtered by workspace metadata → cross-encoder re-ranking (RRF) → LLM generates the answer with citations.

### 2. Art. 30 contract review becomes systematic

The 12 mandatory clauses — `Art.30(2)(a)`–`(h)` (baseline) + `Art.30(3)(a)`–`(d)` (critical/important add-ons: SLAs, prior-notification of material changes, audit & on-site inspection rights, incident-management assistance) — are scored individually with `accept` / `reject` / `waive` sign-off, an audit trail of who signed off when with what note, and a **negotiation-round counter** so multiple drafts against the same vendor stay linked. When an auditor asks *"show me you actually checked clause 30(2)(e) for AWS in 2026"* — one click.

### 3. Vendor due-diligence questionnaires without vendor friction

Tokenised links (`/q/<token>`) — the vendor never creates an account. They click, fill in, submit. The score auto-feeds into the vendor's risk profile. Removes the #1 complaint from third-party teams: *"we can't even get vendors to log in."*

### 4. Risk scoring an auditor can re-derive

Art. 28(3) demands a quantified, defensible methodology. Retrieva's formula is **deterministic** and visible on the UI:

- **Inherent score** = tier base + ICT-function weights
- **Control effectiveness** = Q-score × 40% + DORA gap coverage × 60%
- **Residual factor floor** = 15%

No black-box LLM scoring — every number is reproducible. Crucial when ECB, BaFin, AMF, or DNB asks *"how did you arrive at High?"*

### 5. The Register of Information (Art. 29) is one button

`Export RoI (Excel)` produces the regulator-ready spreadsheet. Without Retrieva, this is typically **2–4 FTE-weeks per cycle** of stitching together SharePoint, JIRA, and a contracts DB.

### 6. Ongoing monitoring with no manual calendar nags

24-hour scan of certifications (ISO 27001 / SOC 2 / CSA-STAR / ISO 22301), contract end dates, and next-review dates → email alerts to the workspace owner before things lapse. Misses on these are the most common DORA finding in supervisory inspections.

### 7. Formal risk decisions are durable artifacts

The `proceed` / `conditional` / `reject` decision is recorded with rationale, who set it, when — and shown on the vendor overview forever. Solves the classic *"we approved this vendor 3 years ago but nobody remembers why."*

### 8. Multi-tenant by design

A bank's M&A integration team, treasury team, and retail tech team can each have their own workspace per vendor, with role-scoped access (`org_admin` / `analyst` / `viewer`), enforced at both the middleware layer (`workspaceAuth`) and the DB layer (`tenantIsolationPlugin` auto-injects a `workspaceId` filter into queries).

### 9. Bilingual (EN / FR) end-to-end

Every screen, form, dialog, and toast is translated. Critical for French / Belgian / Luxembourgish / Quebec compliance teams — and for exporting evidence to AMF, CSSF, or Banque de France in the regulator's expected language.

## Who specifically benefits

| Segment | Typical scale | Where Retrieva delivers most |
|---|---|---|
| **Banks** | 500–2000 ICT vendors | Auto-tier triage from ICT functions — critical (payment_processing, settlement_clearing, core_banking) vs important vs standard. |
| **Insurers** *(launch ICP)* | 50–500 vendors | Art. 30 clause sign-off scorecard with negotiation rounds — long policy tails make this the killer feature. |
| **Payments / PSPs** | 100–500 vendors | Concentration risk (Art. 29) + auto-flagging of critical functions; RoI export is built for them. |
| **Asset managers** | 50–300 vendors | Lean compliance teams (3–10 people) on 200+ vendors — the gap-analysis AI makes it feasible. |

## The 5-step workflow maps 1:1 to DORA

This is the compliance checklist rendered on every vendor overview:

1. **Classify vendor** (Art. 28) — tier + service type.
2. **Due-diligence questionnaire** (Art. 28/30) — send to vendor, get scored response.
3. **Gap analysis** (Art. 28/29) — upload vendor ICT docs, run AI analysis.
4. **Contract review** (Art. 30) — verify all 12 mandatory clauses.
5. **Set up monitoring** — certifications + next review for automated alerts.

## LLM and embedding stack (corrected)

:::note Stack correction
Earlier docs and `CLAUDE.md` mention "Azure OpenAI `gpt-4o-mini` + `text-embedding-3-small`". **This is no longer accurate.** The code in `backend/config/llmProvider.js` and `backend/config/embeddingProvider.js` is authoritative.
:::

**LLM (generation)** — `backend/config/llmProvider.js`:

- Default: **Ollama Cloud** (`https://ollama.com`) via `LLM_PROVIDER=ollama`.
- 3-key rotation across `OLLAMA_API_KEY_1/2/3`, chained with LangChain `withFallbacks()` — if the active key rate-limits, the next is tried automatically.
- Per-purpose overrides via `LLM_<PURPOSE>_PROVIDER` env (`chat` | `analysis` | `judge` | `formatter`) for routing different calls to different providers without changing global config.
- Wired alternative providers: **OpenAI**, **Anthropic**, **Groq** (fast inference). Groq defaults: chat → `llama-3.3-70b-versatile` (better prompt-following for the rephrase chain), formatter/judge → `llama-3.1-8b-instant`.
- **Azure is no longer in the wiring.**

**Embeddings** — `backend/config/embeddingProvider.js`:

- Provider: **self-hosted Ollama** (`EMBEDDING_PROVIDER=ollama`). Dev base `http://localhost:11434`; under `docker compose` the backend service overrides to `http://ollama:11434` (sidecar); in prod, run Ollama beside the API.
- Model: **`bge-m3:latest`** (1024-dim, 8192-token context — drives the chunk-size ceiling).
- Why separate from chat: **Ollama Cloud serves chat/generate but *not* the embeddings API** (returns `unauthorized`). Embeddings have to run on a self-hosted instance.
- Fallback: OpenAI `text-embedding-3-small` if Ollama is unavailable.

## Scope boundaries — what Retrieva deliberately does NOT do

Retrieva is a **deep specialist** on DORA Art. 28–30 third-party ICT risk and AI-augmented contract review. We deliberately **do not** cover the rest of the third-party / vendor risk management universe, and we won't drift there. The market is full of "all-in-one" TPRM tools that do everything superficially; we do one thing exceptionally and integrate cleanly with everything else.

### Out of scope (and won't be added)

| Pillar | Why we don't do it | How we integrate with what does |
|---|---|---|
| **Financial due diligence** (D&B, Dun & Bradstreet, KYC/AML, beneficial ownership) | Different persona (procurement / AML team), mature dedicated tooling exists | Webhook in: a vendor failing financial DD triggers a re-review |
| **ESG assessment** (EcoVadis, climate, human-rights) | Different regulation (CSRD / EU Taxonomy), different buyer (CSR/ESG officer) | Webhook in: ESG score annotation on the vendor profile |
| **Sanction / PEP screening** (Refinitiv World-Check, Dow Jones Risk Center) | AML / financial-compliance domain | Webhook in: a sanctions hit auto-creates a critical Finding |
| **Continuous security posture rating** (BitSight, SecurityScorecard, Black Kite) | A different product surface — own crawlers, own attack-surface management | Webhook in (and out): we consume score-change signals, we emit our DORA risk decisions back so your security team sees them |
| **Procurement / spend management** (Coupa, Ariba) | Irrelevant to compliance | n/a |
| **Contract authoring / drafting** | We do **review** of contracts your legal team or counterparty drafts. We do not generate contracts. | n/a |

### Why this is a strength, not a gap

1. **Generalist TPRM platforms** treat DORA as one module among 50 — superficially. They don't sign Art. 30's 12 clauses individually with negotiation rounds, don't have the Art. 28(3) deterministic risk matrix, don't map Art. 30(2)(e) subcontractor chains, don't generate formal Art. 30(2)(d) exit plans.
2. **Specialist beats generalist** when a regulation is this prescriptive and this new. Buyers want depth, not breadth.
3. **Honest scope = higher trust**. Compliance directors who have been burned by "we do everything" promises respond well to *"we do this perfectly, we integrate with what you have for the rest."*

### The positioning pitch

> *"We don't replace your existing TPRM stack. We're the DORA-specialist + Art. 30 contract-review layer that no generalist TPRM does correctly. Keep BitSight for security posture, keep Refinitiv for sanctions, keep D&B for financial due diligence — Retrieva integrates with them all via webhooks, and together you have the complete coverage that no single tool delivers today."*

### Engineering implication

Our **public API + webhook subsystem** is a first-class strategic surface. Every external signal (security rating change, sanctions hit, financial-score drop, ESG event) maps to a Retrieva first-class object (`SecurityRating`, `SanctionsHit`, …) stored time-series, with a configurable trigger that creates a `Finding` — turning every external signal into an owned, SLA-tracked action item in Retrieva.

## One-sentence pitch

> **DORA Art. 28–30 compliance, done in a week per vendor instead of a quarter, with an audit trail your regulator can replay — integrating with the rest of your TPRM stack, not replacing it.**
