---
sidebar_position: 3
---

# Product principles

Three constitutional principles govern every Retrieva feature, issue, and design decision. They are non-negotiable. If a proposed change violates any of the three, the proposal is rejected — or the principle has to be re-opened explicitly by the founder.

## Clause 1 — Never block a business opportunity

> *Retrieva must never be the reason a customer loses a deal.*

If an HDI Affinitaire account manager negotiates an affinity partnership with Orange Telecom and Orange wants to go live in 4 weeks, Retrieva must be able to produce the DORA compliance evidence in **less than 4 weeks** — not as a stretch, as a guarantee.

The master KPI of the product is **time-to-go-live for a new vendor or partner**, not "compliance score". Compliance happens as a *byproduct* of fast onboarding, not as the destination.

### What this means in engineering

| Question to ask of every feature | Acceptable answer |
|---|---|
| Does this add latency to time-to-go-live? | No — or yes, and a parallel path exists |
| How many user interactions are required where fewer would do? | Reduce by AI pre-fill (Clause 2) wherever possible |
| Are humans required in series when parallel would work? | Default to parallel; serial only when Clause 3 demands it |
| Is there an "urgent" / "fast-track" mode? | Yes for any 5-step workflow |
| Time from event to notification reaching the right person | Seconds, not hours — no email triage |

### Concrete commitments

- **New-partner onboarding** target: 1-2 weeks (vs 8-12 in spreadsheet-based shops), with an explicit < 2-week "urgent" path.
- **Annual renewal** target: under one day of legal time per contract (vs 4-6 weeks today in many compliance teams).
- **Bulk operations** wherever the wizard creates single records (workspaces, members, subcontractors, certifications).
- **Parallel execution** wherever the 5-step DORA workflow today is sequential — contract review can start during gap analysis, not after.

## Clause 2 — AI-first by default

> *Every repetitive manual task is a product bug, to be fixed with AI.*

If the user types, clicks, or copies something a LLM could infer from context, that's a defect. Each screen must answer:

- *What can the LLM pre-fill here?*
- *What can the LLM summarise?*
- *What can the LLM dispatch from natural language?*

The default answer is **"yes, automate"**; the burden is on the engineer to justify any manual step that remains.

### Already AI-driven today

- Reading vendor ICT documents → article-by-article gap analysis (RAG pipeline: multi-query + HyDE + cross-encoder re-rank)
- Scoring vendor questionnaires
- Extracting Art. 30 clause language from contracts
- (Roadmap) Document language detection
- (Roadmap) Contract version diffing
- (Roadmap) Technical Documentation generation for EU AI Act

### Categories still candidate for AI automation

- **AI-drafted formal risk decision proposal** — when a gap analysis completes, the platform should propose a `proceed / conditional / reject` recommendation with a draft rationale built from the tier, the Q-score, the gap counts, the subcontractor concentration. The human risk officer reviews and edits before submitting for approval (Clause 3).
- **AI-pre-filled vendor profile** — from a company name + website URL, infer country, sector, ICT functions, default tier.
- **AI-extracted subcontractor list** — from any uploaded SOC 2 / ISMS / contract, list named third parties and propose criticality. Human accepts.
- **AI-drafted Exit Plan** — from the contract text + subcontractor data + the Art. 30(2)(d) clause sign-off, generate a structured exit plan draft. Human edits.
- **Weekly Findings AI digest** — one paragraph summarising the compliance officer's week: *"3 critical findings closed, 5 new findings opened, 1 vendor in red, recommend escalating X."*
- **Natural-language commands** for power users — *"Create a workspace for Orange Telecom, run a CONTRACT_A30 against this PDF, propose a conditional decision."*

The rule of thumb is brutally simple: **a screen without an AI surface is a defect waiting to be filed.**

## Clause 3 — Human-in-the-loop on strategic accountability

> *The AI proposes, the human disposes, on anything that creates regulatory or legal liability.*

Clause 2 does not mean fully autonomous AI everywhere. Some decisions create **regulatory liability**: a real human must own them, with a signature, a timestamp, and a rationale in the audit trail.

The discriminator is brutally simple:

> *Could a regulator at a future audit ask "who decided this?"*

- **Yes** → human-in-the-loop is mandatory. The AI may propose, but the human signs.
- **No** → the AI may close the loop alone, recorded as `actor: ai-system` in the audit log.

### Mandatory human-in-the-loop stages

| Stage | Required role | Why |
|---|---|---|
| Formal risk decision (`proceed / conditional / reject`) | `risk_officer` | DORA Art. 28(3) auditable accountability |
| Art. 30 clause sign-off | `legal` | Contractual liability |
| Approval of Exit Plan for critical vendors | `risk_officer` (+ group risk where applicable) | Art. 30(2)(d) + regulator inspection readiness |
| Closure of Findings with severity ≥ high | `compliance` + evidence required | Internal control framework defensibility |
| Subcontractor criticality reclassification (downward) | `risk_officer` | Cannot silently de-risk a vendor |
| Removal of a member who has signed off clauses | `owner` | Identity of past decisions must remain valid |
| Risk methodology parameter change | `risk_officer` + audit-log entry pinning old + new | Past decisions must remain reproducible under their original methodology |

### Allowed full automation (AI closes alone)

- Gap analysis report generation
- Auto-creation of Findings from gap entries (status `open`, owner defaulted to workspace owner)
- Cert / contract / review-date expiry alerts
- Document language detection
- Bulk pre-fill of vendor profile from public data
- Periodic security-rating signal ingestion + threshold alerts
- Summary digests sent to humans for triage

## How to use this constitution as a reviewer

When reviewing an issue, a PR, or a feature proposal:

1. **Clause 1 test** — does it accelerate time-to-go-live or slow it? If it slows, what business reason justifies the slowdown? Anything that simply *"adds compliance polish"* without Clause 3 justification is rejected.
2. **Clause 2 test** — is there a manual step in the flow the AI could close? If yes and not justified, the issue is not yet ready — surface the AI surface.
3. **Clause 3 test** — if a step is automated, does it pass the regulator-question test? If a regulator could ask *"who decided this?"* about that step, the human checkpoint is missing. If a step is manual but no one could ever ask that question, the manual step is friction — automate it.

A feature that **adds latency, leaves a manual step unautomated, and does not introduce an accountability checkpoint** has no place in the roadmap.

## Why these principles matter

These three clauses are how Retrieva stays:

- **Customer-aligned** — compliance never becomes the reason their business slows down.
- **Defensibly automated** — the AI is doing 90% of the work, but a human signs every line that matters to a regulator.
- **Differentiated from generalist TPRM** — broad tools cannot afford the depth of AI investment per regulation; the trade-off for breadth is shallow automation. We make the opposite bet.

These principles will continue to apply when Retrieva extends to **EU AI Act** (next regulation module) and **NIS2** (after that). Same constitution, different regulation.

## Related

- [Who it's for](./who-its-for) — buyer segments and value proposition
