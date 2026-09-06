---
sidebar_position: 1
---

# Certification RNCP39583 — dossier & artefacts

**This section is the single home for Retrieva's certification evidence.** It lives in
**Retrieva's own documentation** — deliberately separate from the ktayl-solution / minicloud
platform docs, even though Retrieva runs on that insurance infrastructure.

## The two-layer model (never conflate)

| Layer | What it is | Role in the certification |
|---|---|---|
| **ktayl-solution IS** | The insurance organisation's information system (minicloud platform + business apps) | The **organisational context** — the "company" and infrastructure Retrieva runs on. Supplies **org-level** evidence (BC01). |
| **Retrieva** | This project — a DORA third-party ICT risk-assessment RAG product | The **deliverable defended for the diploma**. Supplies **project-level** evidence (BC02/BC03/BC04). |

Certification **project = Retrieva** (per the CERT-1 pivot, `platform-backlog#282`). The
ktayl-solution IS is its context, **not** the certification itself.

## The 4 competency blocs (RNCP39583, authoritative names from #282)

| Bloc | Name | Primary evidence source | RTV stories |
|---|---|---|---|
| **BC01** | Piloter | ktayl IS context + Retrieva cadrage | RTV-01 (CdCF), RTV-02 (architecture/ADRs) |
| **BC02** | Concevoir & développer | **Retrieva** (the product) | RTV-13…18 (eval, multimodal, concentration, evidence, findings, register) |
| **BC03** | Déployer & sécuriser | **Retrieva** on the platform | RTV-03…09 (GitOps, MongoDB, LiteLLM, SSO, Vault, security, ingress) |
| **BC04** | Optimiser & faire évoluer | **Retrieva** in operation | RTV-10…13 (observability, autoscale, canary, DORA metrics/DR) |

Tracking: GitHub **Project #2 — "Retrieva — RNCP39583 Certification"** (the `Bloc` field uses
these names). The 16 jury-facing documents are tracked in `platform-backlog#195`.

## Artefact index

| Bloc | Artefact | Status | Location |
|---|---|---|---|
| BC02 | Accessibility / RGAA audit (Retrieva) | ✅ 96/100 (2026-09-06) | [BC02 — Accessibility audit](./bc02-accessibility-audit.md) |
| BC01 | Cahier des charges fonctionnel | ⬜ to do | — |
| BC01 | Budget prévisionnel IS | ⬜ to do | — |
| BC02 | Cahier de recettes (Retrieva) | ⬜ to do | — |
| BC02 | Manuel utilisateur / de déploiement | ⬜ to do | — |
| BC03 | Dossier déploiement & sécurité | ⬜ to do (RTV-03…09 built) | — |
| BC04 | Fiche de consignation d'anomalie | ⬜ to do | — |

*(This index is the map; each artefact gets its own page under this section as it's produced.)*
