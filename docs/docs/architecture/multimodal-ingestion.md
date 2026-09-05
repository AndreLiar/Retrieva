---
sidebar_position: 7
---

# Multimodal Ingestion — Design Decision (ADR)

**Status:** Implemented (Phase 1 + Phase 2, dev) · **Tracking issue:** `platform-backlog` RTV-14 (sub-issue of the CERT-1 → Retrieva epic #282) · **Date:** 2026-09-05

:::note Implementation status
**Phase 1 (Docling text + OCR)** — live on retrieva-dev; images accepted, scanned PDFs OCR'd, graceful fallback to local parsers. **Phase 2 (VLM figure captioning)** — implemented and enabled on **dev** (`INGEST_VLM_CAPTION=true`), opt-in on prod. **Vision model = `azure-gpt-4.1-mini`** (funded + EU via LiteLLM), *not* the free `nvidia-vision-90b` (its NIM endpoint is dead) and *not* OpenAI `gpt-4o-mini` (unfunded). The one model serves dev and prod.
:::

> Detailed design for upgrading Retrieva's ingestion beyond text-only. The
> lightweight tracker lives on the backlog (RTV-14); this ADR is the deep design,
> kept next to the code per the platform's "detailed design lives with the code"
> convention.

## Context & problem

Retrieva is today a **strict text-only RAG pipeline**:

- **Upload gate** (`backend/middleware/fileUpload.js`) — whitelist is **PDF, XLSX/XLS, DOCX only**; standalone images (`.png`, `.jpg`) are rejected.
- **Parsers** (`backend/services/fileIngestionService.js`) — `pdf-parse` (PDF text), `xlsx` (cells), `mammoth`/`adm-zip` (docx text). All **pure text extraction**; raster figures, diagrams and vector charts inside documents are silently dropped.
- **Image-only guard** — if extracted text is `< 10` chars it throws *"Could not extract text… the file may be image-only."* — i.e. scanned PDFs and figure-only pages are **detected but not handled**.
- **Vector store** — **Qdrant** (`@langchain/qdrant` + `@qdrant/js-client-rest`), text embeddings only (`bge-m3` / `nvidia-embed` / `text-embedding-3-small`).
- **Governance** — Retrieva's egress NetworkPolicy blocks direct provider calls; **every model call must go through the LiteLLM gateway** (`http://litellm.ai.svc.cluster.local:4000`). Any multimodal expansion must respect this.

**Consequence:** a chart/graph/diagram inside a report, or a scanned/image-only PDF, contributes **nothing** to retrieval. Quantitative queries against data that lives only in a figure return ungrounded answers.

## Decision — hybrid Tier 2 + Tier 3 (keep the text vector store)

Do **not** move to Tier 4 (native multimodal vector space) yet. Keep the existing
**Qdrant** text store and text embedder, and upgrade *how ingestion produces text*:

1. **Tier 2 — platform-native layout/OCR.** Offload PDF/Doc parsing to the existing
   `ai/markitdown-proxy` (Docling) service for table recovery, structural layout, and
   OCR of scanned pages — instead of local `pdf-parse`.
2. **Tier 3 — governed VLM figure captioning.** Route extracted figure regions through
   the **LiteLLM gateway** to a vision model that produces a concise analytical text
   summary (axes, labels, trends), which is then chunked and embedded alongside the
   body text.

Delivered in two phases (Phase 1 = Tier 2 alone is independently shippable and covers
the majority of the corpus; Phase 2 = Tier 3 adds figure understanding).

### Target ingestion flow

```
Existing:
[Upload PDF] → [pdf-parse] → (<10 chars? throw) → [Text Chunker] → [Embedder] → [Qdrant]

Target:
[Upload PDF/Image] → [markitdown-proxy / Docling]
                          │
            ┌─────────────┴─────────────┐
            ▼                            ▼
     [Markdown + Tables + OCR]     [Extracted figure crops]
            │                            │
            │                            ▼
            │                  [LiteLLM Vision Gateway]  (VLM caption: axes/labels/trends)
            │                            │
            └─────────────┬──────────────┘
                          ▼
              [Unified Markdown payload] → [Chunker] → [Embedder] → [Qdrant]
```

### Component breakdown

| Component | File / service | Target state |
|---|---|---|
| Upload whitelist | `middleware/fileUpload.js` | Allow `image/png`, `image/jpeg` alongside the document types |
| Ingestion engine | `services/fileIngestionService.js` | Delegate parsing to `markitdown-proxy` / `rag-ingest` over cluster-internal HTTP instead of local `pdf-parse` |
| Vision gateway client | `services/visionService.js` *(new)* | LiteLLM `chat/completions` with base64 figure crops; prompt for concise analytical summaries |
| Fallback guard | `services/fileIngestionService.js` | Replace the `<10 chars` hard rejection with automatic OCR/Docling fallback; if the VLM fails, complete with Docling text only |

## Tradeoff analysis — Docling-only (Tier 2) vs Docling + VLM (Tier 3)

| Dimension | Docling-only (layout & tables) | Docling + LiteLLM VLM captioning |
|---|---|---|
| Scope | Scanned text (OCR), layout hierarchy, Markdown tables | + semantic understanding of charts/diagrams/figures |
| Per-page latency | 0.5–3.0s/page digital; 3–8s scanned OCR | Docling + 1.5–4.0s per detected figure |
| P99 (20-page, ~6–8 figures) | ~15–30s | ~45–90s serialized / ~20–40s parallelized (concurrency 4) |
| Cost model | Fixed cluster compute (CPU) | Fixed compute + variable per-image inference tokens |
| Compute profile | Ingestion worker CPU-bound; 4–8 GB RAM pod | Worker I/O-bound; VLM worker GPU-bound |
| Failure modes | Layout/OCR timeout on dense pages | Gateway rate-limits, VLM hallucination, NIM 404s |

**Latency.** Docling is **linear and predictable** (~1.5–3.5 pages/s digital; +1.5–5s/page scanned). Each VLM figure call is ~1.5–3.5s round-trip (vision encode 0.4–0.8s + 75–150 output tokens 1.0–2.5s). A 20-page/8-figure PDF ≈ 35s serialized, ≈ 20s at concurrency 4.

**Cost.** Docling-only = **$0 marginal** (existing `ai/markitdown-proxy` CPU footprint). VLM captioning: a ~800×600 chart ≈ 1,000–1,600 input vision tokens + ~150 output. Per 1,000 figures: self-hosted/NIM VLM ≈ marginal GPU only; a small cloud multimodal (e.g. GPT-4o-mini class) ≈ **$0.25–0.40**; a tier-1 VLM ≈ **$4.50–6.00**. Without a visual pre-filter, decorative logos/icons burn quota for zero information.

**Resources / OOM.** Docling's rasterization of high-DPI PDFs can spike to 4–6 GB RAM → pin `markitdown-proxy` pod limit ≥ 8 GB. VLM concurrency must be capped worker-side (`max_concurrent_vlm_requests = 4`) so simultaneous ingests don't saturate LiteLLM connection pools.

### Verdict — when to choose which

- **Phase 1 (Docling-only)** if the corpus is mostly legal filings, text-heavy PDFs, scanned invoices, and financial *tables*; predictable sub-10s ingestion is an SLA; zero marginal token cost is desired.
- **Phase 2 (add VLM)** only when retrieval demonstrably fails because quantitative data lives *exclusively* inside bar/line/scatter charts — and only with a heuristic pre-filter (min area > 200×200 px, aspect ratio 0.2–5.0, non-solid-colour entropy) to avoid paying for decorative graphics.

## Failure modes & mitigations

1. **VLM latency / gateway timeouts** — cap captioning per document (e.g. max 10 figures, prioritised by surface area); process figures with bounded concurrency; never block the whole job on one figure.
2. **NIM/preview model 404s** — `nvidia-vision-90b` and other free NIM vision models are intermittently de-listed (verify `/v1/models` + a real call first). Configure a LiteLLM **fallback chain**: primary served VLM → EU cloud VLM.
3. **Low-information images** (icons/watermarks/logos) — dimension + entropy pre-filter at the Docling extraction step.
4. **NetworkPolicy regression** — image buffers stay in-memory or pass only through internal cluster DNS; **all** inference via `litellm.ai.svc.cluster.local:4000`. No direct external egress from the ingestion worker.
5. **Prod provider constraint** — the free NIM path is **dev-only** (US); prod generation/vision must use an **EU-compliant** provider via LiteLLM (DORA/RNCP39583 posture — mirrors the existing text-LLM split where cloud EU providers are prod-only).

## Consequences

- ✅ Scanned PDFs and figure-bearing reports become retrievable; quantitative queries get grounded.
- ✅ Reuses governed platform components (Docling, LiteLLM, Langfuse, Qdrant) — no new vector store, no direct egress, observability inherited (vision calls appear in LiteLLM/Langfuse).
- ⚠️ Variable ingestion cost + latency once Phase 2 is on → requires the pre-filter, concurrency cap, and per-doc figure cap.
- ⛔ Not addressed here: image-as-first-class-retrieval (Tier 4, CLIP-style multimodal embeddings + VLM answering) — a larger future decision if captioning proves insufficient.

## Acceptance criteria (tracked in RTV-14)

- [x] `fileUpload.js` accepts `.png`/`.jpg` without validation errors. *(Phase 1)*
- [x] A scanned, text-free PDF produces retrievable chunks (>0-char embeddings) via Docling OCR. *(Phase 1 — verified live: an image OCR'd to `## Hello DORA RTV14 Docling OCR test`)*
- [x] A chart-bearing PDF produces Markdown chunks describing chart axes/trends via LiteLLM captioning. *(Phase 2 — `azure-gpt-4.1-mini`; docling returns figure crops via `image_export_mode=embedded`)*
- [x] No outbound HTTP leaves Retrieva directly; all vision inference goes through the LiteLLM gateway (governed, EU key). *(egress netpol ai:8000/5001 + LiteLLM only)*
- [x] If the vision model fails/times out, ingestion completes with the text path (no job termination). *(best-effort captions + Phase 1 fallback)*

## Cost gates (the "VLM only when necessary" rule)

The VLM is an **ingestion-time enrichment**, never a per-request/per-chat call. All must pass before one call: (1) `INGEST_VLM_CAPTION` on; (2) the doc has figures (pure-text → 0 calls); (3) each figure passes the pre-filter (`VLM_MIN_FIGURE_PT`, aspect 0.2–5.0, `VLM_MIN_FIGURE_BYTES` — skips logos/icons); (4) per-doc cap (`VLM_MAX_FIGURES`, largest-first) + bounded concurrency (`VLM_CONCURRENCY`). A 40-page contract = 0 calls; a 3-chart deck ≈ 3.
