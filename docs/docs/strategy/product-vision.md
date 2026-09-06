---
sidebar_position: 2
---

# Retrieva — Product Vision (canonical map)

> **Retrieva turns DORA ICT third-party risk from a 300-page manual review into a
> continuous, AI-assisted, human-governed pipeline:** upload vendor evidence → auto-map to
> DORA Art. 28–30 → score risk → **a human ratifies** → the Register of Information stays live.

This is the single source of truth for *what Retrieva is, what it does today, and where it is
going*. It is grounded in the actual codebase, not aspiration. Companion docs:
[YC one-pager](./yc-one-pager.md) (positioning) · certification docs (RNCP evidence).

## The design principle that makes it defensible

**AI extracts, classifies and scores; the human decides.** Retrieva never outputs
"vendor X is DORA-compliant: YES." It outputs *evidence → requirement → assessment → confidence →
human-review-required*. In regulated finance, that human-in-the-loop governance is the only
sellable form of AI — and it is baked into the code (extracted edges are confidence-scored and
excluded from scoring until a person confirms them).

## Market problem / validation — the regulator proved it

This is not a "we think this is a problem" pitch. The **regulator's own exercise** proved the
failure and named the exact gaps Retrieva is built to prevent.

**The killer stat:** in the **2024 ESA "dry run,"** each Register of Information was subjected to
**116 data-quality checks — only 6.5% of firms passed all of them.** The three most common
failures: **incomplete contract data, missing subcontractor (nth-party) information, and incorrect
CIF (Critical/Important Function) classification.** Root cause cited: *"an Excel spreadsheet cannot
maintain the required relational integrity between entities, contracts and functions"* →
spreadsheet Registers *"typically fail by the first formal submission"* at 50+ vendors.

**Complaints ≈ Retrieva's feature list:**

| Complaint (real, sourced) | Retrieva capability |
|---|---|
| 6.5% pass — spreadsheets can't hold relational integrity | Register (`roiExportService`) on a **relational graph** (Org→Workspace→CriticalFunction→ProviderDependency), not a sheet |
| Missing subcontractor / 4th-party info | **`concentrationService` nth-party graph** — the moat, literally this gap |
| Incorrect CIF classification | `CriticalFunction` model + AI control-mapping |
| 300-page SOC2/ISO/DPA manual review doesn't scale | Docling+RAG ingestion → auto-extract → Art 28–30 mapping |
| Too expensive / no expertise (esp. smaller firms; ~half of UK firms spent >€1M) | AI extracts + scores, human ratifies → replaces consultant/headcount cost |
| Contract clauses (audit rights, exit) — vendors resist | clause checker + exit-strategy scoring (roadmap) |
| Continuous monitoring / re-assess on change | `alertMonitorService` |

**The positioning line this unlocks:** *"93.5% of firms failed the ESA's Register data-quality
checks because spreadsheets can't model the entity→contract→function→subprocessor graph. Retrieva
is that graph — so the Register is correct by construction."*

**Sources:**
[EBA — 2024 DORA Dry Run key findings (6.5% / 116 checks)](https://www.eba.europa.eu/sites/default/files/2024-12/c1454b59-15cc-445e-be14-966e3338cedc/ESA%202024%2035%20DORA%20Dry%20Run%20exercise%20summary%20report%20for%20publication.pdf) ·
[Neotas — DORA TPRM 2026 (spreadsheet failure, subcontractor gaps)](https://www.neotas.com/dora-compliance-for-third-party-risk-management/) ·
[Infosecurity Magazine — smaller-firm resource gap](https://www.infosecurity-magazine.com/news/dora-financial-firms-compliance/) ·
[Fintech Global — true cost of DORA non-compliance (>€1M)](https://fintech.global/2026/03/17/the-true-cost-of-dora-non-compliance-in-financial-services/) ·
[Kiteworks — DORA TPRM (contract renegotiation, oversight gaps)](https://www.kiteworks.com/third-party-risk/dora-third-party-risk-management/) ·
[Trusty — shared compliance burden](https://trusty.report/dora-third-party-risk-management-how-financial-entities-and-ict-providers-share-the-compliance-burden/)

## What Retrieva is today (built, in code)

The DORA ICT-TPRM workflow is already implemented end-to-end:

```
Vendor + documents (SOC2 / ISO / DPA / SLA — incl. scanned & chart PDFs via Docling + VLM)
    → fileIngestion → RAG (Qdrant, DORA knowledge base)
    → gapAnalysisAgent + questionnaireScorer   →  DORA Art 28/29/30 control mapping
    → concentrationService (nth-party graph · SPOF · shared-substrate)   ← the moat
    → risk scoring   →   HUMAN validation   →   reportGenerator + roiExportService (RT.02.01 Register)
    → alertMonitorService (continuous monitoring / re-assessment on change)
```

Built surface (backend services): `AssessmentService`, `concentrationService`, `gapAnalysisAgent`,
`QuestionnaireService`, `visionService` (multimodal), `reportGenerator`, `roiExportService` (the
Register), `alertMonitorService`, plus full multi-tenant (`Organization → Workspace → members`),
Stripe billing, MFA, auth. Domain models: `Assessment`, `CriticalFunction`, `ProviderDependency`
(the graph), `VendorQuestionnaire`, `Organization/Workspace`.

## The roadmap — 6 themes (the ~90 open issues cluster into these)

| # | Theme | What it is | Representative issues | Maturity |
|---|---|---|---|---|
| **1** | **Core DORA engine** | The assessment → register → monitor loop | #162, #166, #167, #168, #300, #301, #302, #366, #416 | 🟢 built, deepening |
| **2** | **Concentration & nth-party graph** *(the moat)* | Art 28(4)/29 — the cross-vendor question questionnaire-tools can't answer | #165, #207, #300, #350 (RTV-15 ✅) | 🟢 differentiator |
| **3** | **Evidence + Findings workflow** | Evidence library, vendor portal, finding tracker, approvals | #226, #227, #228, #365, #360, #378 (RTV-16/17) | 🟡 next |
| **4** | **AI depth & quality** | Eval harness, AI-drafted decisions, NL command, injection defence | #385, #374, #375, #377, #220, #221 | 🟡 the "how do you know it works" layer |
| **5** | **Multi-regulation expansion** | EU AI Act · NIS2 · Solvency II — one engine, many frameworks | #171, #355, #369, #359 | 🔵 the scale story |
| **6** | **Enterprise-ready** | SSO, API, white-label, i18n (DE/FR), audit log, observability, Azure | #214, #218, #408, #351, #213, #224, #390 + epics #385–#393 | 🟡 sell-ability |

## The strategic through-line

- **Now** — a working DORA-TPRM product. Themes **1–2** are the moat: the **nth-party
  concentration graph** tied to the regulator's own RT.02.01 Register is the thing competitors
  (questionnaire-first tools) can't easily copy.
- **Next (the fundable wedge)** — themes **3–4** make it *sellable + trustworthy*: the evidence
  workflow + **measurable AI evaluation** (recall@5, groundedness, hallucination %, cost/latency)
  are the traction numbers a buyer and an investor both ask for.
- **Later (the vision)** — theme **5**: "one engine, many regulations" turns a DORA tool into a
  **multi-framework compliance platform**, and ultimately the **governance layer of the AI-native
  insurer** (see the platform's *AI-First Insurance Operating Model*). Compliance is the wedge with
  mandatory demand; the platform is the expansion.

## Honest risks (from the issue backlog)

- **Email is DOWN in prod** (`emailConfigured:false`, no `RESEND_API_KEY`) — the entire
  notification/digest half (monitoring digests, finding digests, concentration alerts, questionnaire
  invites, exec dashboard) silently no-ops. Tracked: #475.
- **Strategic epics #385–#393 are buckets, not stories** — they must be decomposed or they stall.
- **Worker fragility** (#437, #438, #439, #440, #433) — the async ingestion/embedding path has
  reliability bugs, and the product's *continuous* promise depends on it.
- **Scope debt** — several `placeholder` issues to prune (Bucket-C icebox from backlog triage).

## Where things live (two-layer model)

- **Retrieva** = the RNCP39583 **certification project** + fundable product — its own docs (this
  site); certification evidence under `certification/` by bloc.
- **ktayl-solution IS** = the insurance organisation Retrieva *runs on* — documented in the
  platform docs, not here. Retrieva is the IS's **governance exhibit**, not part of it.
