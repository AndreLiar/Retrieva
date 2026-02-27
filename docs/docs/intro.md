---
sidebar_position: 1
slug: /
---

# Retrieva — DORA Compliance Platform

Welcome to the **Retrieva** documentation. Retrieva is a production-ready DORA compliance intelligence platform for financial entities — automating third-party ICT risk assessments, vendor questionnaires, monitoring alerts, and EBA Register of Information export.

## What is Retrieva?

Retrieva helps compliance and risk teams meet their obligations under **DORA (Regulation EU 2022/2554 — Digital Operational Resilience Act)**:

- **Third-Party ICT Risk Assessments**: Upload vendor documentation (PDF, DOCX, XLSX) and get a structured DORA gap analysis in minutes
- **Vendor Questionnaires**: Auto-generate and score vendor security questionnaires using LLM evaluation
- **Compliance AI Copilot**: Ask compliance questions in natural language — the copilot searches your documentation and DORA articles
- **Monitoring Alerts**: Automated 24-hour alerts for certification expiry, contract renewal, annual reviews overdue, and assessment gaps
- **Register of Information Export**: One-click EBA-compliant DORA Article 28(3) XLSX workbook (RT.01.01 → RT.04.01)
- **Multi-Tenant Architecture**: Secure workspace isolation with RBAC for multiple vendors and teams

## Platform Phases

The platform was built across four delivery phases:

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | RAG foundation — knowledge ingestion, vector search, AI copilot | ✅ Production |
| Phase 2 | Multi-source ingestion — files, URLs, Notion, Confluence; DORA assessment UI | ✅ Production |
| Phase 3 | Vendor questionnaires with LLM scoring | ✅ Production |
| Phase 4 | Monitoring alerts + Register of Information export | ✅ Production |

## Key Features

### Intelligent RAG Pipeline

```
User Question → Intent Classification → Retrieval Strategy → Document Retrieval
     → Reranking → Context Compression → LLM Generation → Answer Validation
```

### DORA Gap Analysis

The assessment worker analyses vendor ICT documentation against DORA articles and classifies coverage per article:

```
File Upload → Parse (PDF/DOCX/XLSX) → Semantic Chunking → Embed to Qdrant
     → LLM Gap Analysis per DORA Article → covered / partial / missing
```

### Automated Compliance Monitoring

A BullMQ repeatable job runs every 24 hours and sends email alerts to workspace owners:

- Certification expiry — 90 / 30 / 7 day thresholds
- Contract renewal — 60 days
- Annual review overdue
- No assessment in 12 months

### EBA Register of Information

`GET /api/v1/workspaces/roi-export` generates a 4-sheet XLSX workbook:

| Sheet | Content |
|-------|---------|
| RT.01.01 | Institution summary + vendor counts by criticality tier |
| RT.02.01 | One row per vendor with contract, country, service type, tier, scores |
| RT.03.01 | One row per certification per vendor |
| RT.04.01 | One row per DORA gap from the latest complete assessment |

### Multi-Layer Security

- JWT-based authentication with refresh tokens
- Workspace-level authorization (RBAC — owner, admin, member, viewer)
- Database-level tenant isolation
- LLM output guardrails and hallucination detection
- Encrypted Notion OAuth tokens at rest

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Express 5, Node.js 20+ |
| AI Orchestration | LangChain (LCEL chains, prompts, parsers) |
| LLM | Azure OpenAI (GPT-4o-mini) |
| Embeddings | Azure OpenAI (text-embedding-3-small) |
| Vector Store | Qdrant |
| Database | MongoDB (Mongoose ODM) |
| Cache / Queue | Redis, BullMQ |
| Real-Time | Socket.io |
| Frontend | Next.js 16, React 19, TypeScript |
| UI Components | shadcn/ui, Tailwind CSS |
| Monitoring | LangSmith, RAGAS |
| Export | xlsx (XLSX workbook generation) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 16)                      │
│  Assessments · Questionnaires · Copilot · Sources · Analytics   │
├─────────────────────────────────────────────────────────────────┤
│                    API Gateway (Express 5)                      │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│   RAG        │  Assessment  │ Questionnaire│   Workspace /     │
│   Service    │  Service     │  Service     │   Export Service  │
├──────────────┴──────────────┴──────────────┴───────────────────┤
│              Background Workers (BullMQ)                        │
│  notionSync · documentIndex · assessment · questionnaire        │
│  monitoring (24h alerts)                                        │
├──────────────┬──────────────┬──────────────────────────────────┤
│   Qdrant     │   MongoDB    │           Redis                  │
│   (Vectors)  │   (Data)     │       (Cache / Queue)            │
└──────────────┴──────────────┴──────────────────────────────────┘
```

## Quick Links

- [Getting Started](/getting-started) — Set up the platform locally
- [Architecture Overview](/architecture/overview) — Understand the system design
- [API Reference](/api/overview) — Explore the REST API
- [Background Workers](/backend/workers) — BullMQ worker reference
- [Environment Variables](/deployment/environment-variables) — Configuration reference
- [Security](/security/overview) — Security measures and RBAC
- [Deployment](/deployment/docker) — Deploy to production
