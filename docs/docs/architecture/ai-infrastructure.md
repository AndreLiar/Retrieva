---
sidebar_position: 6
---

# AI Infrastructure

How the AI parts of Retrieva fit together: the language-model layer, embeddings, the vector store, retrieval, the regulatory knowledge base, and the asynchronous job system that runs the heavy AI work. For *which* model is chosen and why, see [LLM Model Selection](./llm-model-selection.md); for the retrieval flow, see [RAG Pipeline](./rag-pipeline.md).

## At a glance

```
            ┌──────────────────────────── Request / Worker ────────────────────────────┐
            │                                                                            │
  user ──►  Chat / Assessment / Questionnaire                                            │
            │            │                    │                       │                  │
            ▼            ▼                    ▼                       ▼                  │
      LLM layer     Embedding layer      Vector store           Job queue (BullMQ)      │
   (per-purpose)   (bge-m3, 1024-dim)   (Qdrant)                (Redis)                  │
   Ollama Cloud ─┐                       ├─ workspace coll. ──┐  ├─ fileIndex            │
   Groq        ──┤  self-hosted Ollama   │  (tenant-filtered) │  ├─ gapAnalysis          │
   OpenAI      ──┤  ── bge-m3 sidecar    └─ compliance_kb ────┘  ├─ scoreQuestionnaire   │
   Anthropic   ──┘     (OpenAI fallback)    (shared DORA KB)     └─ monitoring/digest    │
            └────────────────────────────────────────────────────────────────────────────┘
```

## 1. Language-model layer

A **provider factory** (`config/llmProvider.js`) selects a provider + model **per purpose**, so each workload runs on the right speed/quality/cost tier.

| Purpose | Used by | Default in production |
|---|---|---|
| `chat` | RAG Q&A (`rag.js`) | Groq `llama-3.3-70b-versatile` (fast, streaming) |
| `analysis` | gap analysis, contract review (`gapAnalysisAgent.js`) | global default → Ollama `gemma3:12b` |
| `judge` | questionnaire scoring, eval | global default → Ollama `gemma3:12b` |
| `formatter` | JSON shaping | Groq `llama-3.1-8b-instant` |

- **Default provider**: **Ollama Cloud** (`https://ollama.com`) with **3-key rotation** (`OLLAMA_API_KEY_1/2/3`) chained via LangChain `withFallbacks()` — when one key is rate-limited, the next is tried automatically.
- **Pluggable** per purpose via env: `LLM_<purpose>_PROVIDER` / `LLM_<purpose>_MODEL` (providers: `ollama`, `groq`, `openai`, `anthropic`). The global default is `LLM_PROVIDER` / `LLM_MODEL`.
- **Resilience**: key rotation + provider fallback + per-call timeouts (`LLM_INVOKE_TIMEOUT`, streaming timeouts).

## 2. Embedding layer

- **Self-hosted Ollama `bge-m3:latest`** (`config/embeddingProvider.js`) — **1024-dim**, 8192-token context, runs as a sidecar (`http://ollama:11434`). Ollama *Cloud* does not serve the embeddings API, so embeddings are always local/self-hosted.
- **`bge-m3` is multilingual** — it supports cross-lingual retrieval (e.g. a French query can match English source text). This matters for the knowledge base (see [§5](#5-regulatory-knowledge-base)).
- **Fallback**: OpenAI `text-embedding-3-small`.
- The embedding model fixes the chunk-size ceiling (`EMBEDDING_CONTEXT_TOKENS`).

## 3. Vector store

**Qdrant** holds two kinds of collections:

| Collection | Contents | Scope |
|---|---|---|
| `langchain-rag` (workspace) | vendor documents (indexed via assessments) | **tenant-filtered** on `metadata.workspaceId` |
| `compliance_kb` | the shared DORA regulatory text | shared across all workspaces |
| `assessment_<id>` | per-assessment working set (for gap analysis) | per assessment |

**Tenant isolation** is enforced at the vector layer (`services/security/tenantIsolation.js`): every workspace retrieval *must* carry a `metadata.workspaceId` filter — a member of workspace A can never read workspace B's vectors, even with a spoofed header.

## 4. Retrieval & RAG pipeline

1. **Query expansion** — multi-query + HyDE generate several search vectors.
2. **Retrieval** — Qdrant similarity search (k=15) over the workspace collection (tenant-filtered) **and** `compliance_kb`, in parallel.
3. **Re-ranking** — cross-encoder re-ranking via Reciprocal Rank Fusion (`services/rag/crossEncoderRerank.js`; provider configurable: Cohere / LLM / none).
4. **Generation** — the `chat` LLM produces a **cited** answer, instructed to *respond in the same language as the question*.

## 5. Regulatory knowledge base

- Source of truth: `backend/data/compliance/dora-articles.json` — verbatim DORA article text + RTS/ITS references, **versioned** (`version`, `lastVerified`, `nextReviewDate`) and seeded into `compliance_kb` by `scripts/seedComplianceKb.js`.
- **Currently English only** (sourced from EUR-Lex English). Because `bge-m3` is multilingual, non-English questions still retrieve the right articles and the answer is returned in the user's language — but the **cited source snippets are English**. Ingesting the official French (and other EU-language) DORA texts would give same-language citations and slightly sharper retrieval for those users.

## 6. Asynchronous AI jobs

Heavy AI work runs off the request path on **BullMQ** queues (backed by Redis), processed by a separate worker process (`workers/`):

| Queue / job | Work |
|---|---|
| `assessmentQueue` → `fileIndex` | parse → chunk → embed → upsert vendor docs to Qdrant |
| `assessmentQueue` → `gapAnalysis` | LLM agent maps chunks to DORA articles → structured report |
| `questionnaireQueue` → `scoreQuestionnaire` | LLM scores each vendor answer + executive summary |
| `monitoringQueue` | scheduled compliance alerts + weekly digest |

Indexing uses **deterministic SHA-256 point IDs**, so retries are idempotent.

## Configuration summary

| Concern | Env | Default |
|---|---|---|
| LLM provider / model | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_<purpose>_*` | `ollama` / `gemma3:12b` |
| Embeddings | `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` | `ollama` / `bge-m3:latest` |
| Vector store | `QDRANT_URL`, `QDRANT_COLLECTION_NAME` | — / `langchain-rag` |
| Queues / cache | `REDIS_URL` | — |

> **Note on model fit**: the most reasoning-heavy workload (gap analysis / contract review) runs on the global-default model. Whether that model is strong enough is a question to settle with the evaluation harness (golden dataset + faithfulness / citation metrics), not by intuition.
