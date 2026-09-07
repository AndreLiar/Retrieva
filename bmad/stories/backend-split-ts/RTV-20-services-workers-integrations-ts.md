---
id: RTV-20-services-workers-integrations-ts
title: "Convert services, workers, and integrations to TypeScript"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 8
labels: [typescript, backend, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **Backend Developer**, I want the service, worker, and integration layers typed so that the RAG pipeline, background jobs, real-time, payments, and vector-store calls are checked against the SDKs' own types.

## Background

The heavy logic lives here: RAG (`services/rag.js`, `fileIngestionService.js`, `visionService.js`), LLMOps tracing/prompt-management (`config/tracing.js`, `config/promptManager.js`, `prompts/`), BullMQ workers, socket.io, Stripe, Qdrant, LangChain. All ship first-class `.d.ts` types today — currently unused.

## Acceptance Criteria

- [ ] AC-1: `services/*.js`, `workers/**`, `config/*.js`, `prompts/*.js`, `utils/*.js` → `.ts`.
- [ ] AC-2: LangChain/LangGraph message + chain types used (no `any` on LLM payloads); the LLMOps trace tree (`startTrace`/spans/generations) and prompt-manager (`resolveRagPrompt`, Git fallback) stay behaviourally identical and typed (per `llmops.md`).
- [ ] AC-3: BullMQ job payloads typed (Job data/return generics); socket.io event maps typed (`Server<ClientToServer, ServerToClient>`).
- [ ] AC-4: Stripe + Qdrant + ioredis + mongoose clients typed from their packages; multimodal ingestion (Docling/VLM caption) path typed.
- [ ] AC-5: All vitest (unit + integration incl. rag/conversation/auth/health) green; governance egress behaviour unchanged (LiteLLM-only per the egress netpol).

## Technical Notes

- Type job/event payloads once (shared `types/` module) and reuse across producer + consumer.
- Keep the null-safe self-nesting trace handle so disabled-mode stays a no-op.
- Watch the LiteLLM UA header + Langfuse media-egress details — no runtime behaviour change, only types.

## Definition of Done

- [ ] All ACs met; `tsc --noEmit` green; full vitest suite green
- [ ] RAG happy-path integration test passes against the typed pipeline
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Convert services/config/prompts/utils to `.ts`
- [ ] Type LangChain payloads + the LLMOps trace/prompt modules
- [ ] Type BullMQ jobs + socket.io events (shared `types/`)
- [ ] Type Stripe/Qdrant/redis/mongoose usage; keep vitest green

## Dependencies

- Depends on: RTV-18
- Blocks: RTV-21
