---
sidebar_position: 8
---

# Prompt Management & Collaborative Engineering

**Status:** Live on dev + prod (2026-09-05). Part of the platform's per-product LLMOps
standard ([`.claude/rules/llmops.md`](https://andrelair-platform.github.io/minicloud-platform-docs/docs/ai-ml/per-product-llmops)).

Retrieva's RAG system prompt is **managed in Langfuse**, not hardcoded in Git — so it
can be tuned, versioned, A/B-tested and rolled back **without a code deploy**, by a
product owner or domain expert, while staying governed and safe for a DORA/compliance
product.

## Why

A hardcoded prompt couples every wording change to a full CI + deploy cycle, and gives
no per-answer attribution of *which* prompt produced *which* output. Moving it into the
dedicated `retrieva` Langfuse project decouples prompt iteration from releases and links
every generation to the exact prompt version — the "collaborative engineering" workflow.

## How it works

```
request ─▶ resolveRagPrompt()                     config/promptManager.js
             │  getLangfusePrompt("retrieva-rag-system", { label })   ── Langfuse (primary)
             │       └─ label = LANGFUSE_PROMPT_LABEL   (prod=production · dev=latest)
             │  .compile({ context, responseInstruction })            ── Mustache {{vars}}
             │  ▲ on miss/error ─▶ Git RAG_SYSTEM_TEMPLATE            ── fallback (no SPOF)
             ▼
   buildRagChatPrompt(systemText)  → literal SystemMessage + history + user turn
             ▼
   answerGen.update({ prompt })     → trace-linked prompt-version attribution
```

- **Decoupled deployment.** The prompt lives in Langfuse (`retrieva-rag-system`). The
  Git `RAG_SYSTEM_TEMPLATE` (`backend/prompts/ragPrompt.js`) is the **seed + runtime
  fallback**: resolution is Langfuse-first and falls back to the committed template if
  Langfuse is disabled/unreachable — so prompt management is **never a runtime SPOF**.
- **Dynamic label routing (one project, dev + prod).** Code pulls by **label**, not a
  pinned version, via the per-overlay `LANGFUSE_PROMPT_LABEL` (prod = `production`,
  dev = `latest`). Moving the `production` label to a new version is an **instant,
  zero-downtime** rollout/rollback — no redeploy.
- **Mustache + typing.** Variables are `{{context}}` / `{{responseInstruction}}`,
  compiled via `prompt.compile()`. The message *structure* (chat history + delimited
  user question) stays in code; the compiled system text is passed as a **literal**
  `SystemMessage` so braces in the retrieved context are never re-parsed.
- **Trace-linked attribution.** The resolved prompt object is attached to the app-level
  `answer` generation (`gen.update({ prompt })`), so every answer in Langfuse links to
  the exact prompt version that produced it — the basis for A/B testing and regression
  attribution.
- **Guarded-dynamic model params.** `temperature` / `top_p` / `maxTokens` are read from
  the prompt `config` too — but **clamped** in code to safe bounds
  (temp `[0,2]`, topP `[0,1]`, maxTokens `[1,4096]`) and the prompt's `model` is
  **ignored** (the model stays env-routed via `LLM_MODEL` so a prompt edit can't bypass
  EU/governance routing). A bad playground value can never reach prod.

## The Playground (test against real trace data)

Because the prompt lives in Langfuse, the **Playground** lets a non-dev edit the
template, adjust model params, and **run** it — including **"Open in Playground" from
any real trace** to replay a production request. Playground execution is routed through
the **governed LiteLLM gateway** (not a raw provider key):

- LLM Connection → base URL `http://litellm.ai.svc.cluster.local:4000/v1`, the retrieva
  team key → spend is attributed to the retrieva team, only granted models are callable.
- Two platform enablers were required: an `allow-langfuse-to-litellm` NetworkPolicy
  (the `ai` ns is default-deny-ingress) and `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST`
  (Langfuse's SSRF guard blocks private-IP LLM connections; the public URL is behind
  Cloudflare Access). Both keep the call **on-cluster and governed**.

## Operate / audit

| Action | How |
|---|---|
| Edit + test a prompt | Langfuse UI → Prompts → `retrieva-rag-system` → Playground (model `tier-premium`) |
| Ship a change to prod | save a new version → move the **`production`** label to it (zero redeploy) |
| Roll back | move `production` back to the prior version |
| Iterate in dev only | dev pulls **`latest`** — new versions hit dev automatically, prod stays on `production` |
| Which prompt made this answer? | open the trace → the `answer` generation shows the linked prompt version |
| Seed / update via API | `langfuse.createPrompt({ name, type:'text', prompt, labels:['production'], config:{ variables, temperature, topP, maxTokens } })` |

## Managed prompts

All of retrieva's LLM prompts are now Langfuse-managed (one project, label-routed,
Git fallback). The RAG prompt is templated (Mustache vars + guarded-dynamic params);
the other three are static system prompts.

| Langfuse prompt | Drives | Git fallback |
|---|---|---|
| `retrieva-rag-system` | RAG answer generation (templated + model params) | `backend/prompts/ragPrompt.js` |
| `retrieva-contract-a30-system` | DORA Art.30 contract-review ReAct agent | `backend/prompts/gapAnalysisPrompts.js` |
| `retrieva-dora-gap-system` | DORA gap-analysis ReAct agent | `backend/prompts/gapAnalysisPrompts.js` |
| `retrieva-vision-caption` | Figure captioning (multimodal) | `backend/services/visionService.js` |

## Files

| Concern | Location |
|---|---|
| Resolver (generic Langfuse-first + fallback + clamp) | `backend/config/promptManager.js` (`resolveManagedPrompt`, `resolveRagPrompt`, `resolveContractA30Prompt`, `resolveDoraPrompt`, `resolveVisionCaptionPrompt`) |
| Langfuse client + `getLangfusePrompt` | `backend/config/tracing.js` |
| Seed template + Mustache vars + chat builder | `backend/prompts/ragPrompt.js` |
| Static agent prompts (seed + fallback) | `backend/prompts/gapAnalysisPrompts.js` |
| Wiring: RAG | `backend/services/rag.js` (`_generateAnswer`) |
| Wiring: gap-analysis agents | `backend/services/gapAnalysisAgent.js` |
| Wiring: vision caption (+ prompt-version link) | `backend/services/visionService.js` |
| Model-param passthrough (`topP`) | `backend/config/llmProvider.js` |
| Env (per overlay) | `LANGFUSE_PROMPT_LABEL` (prod=production / dev=latest) |

## Notes

- Playground **execution** requires the LLM Connection configured in Langfuse project
  settings (one-time, owner-only — done 2026-09-05).
- **Guarded-dynamic model params** apply to the RAG prompt; the three static agent/vision
  prompts are managed for text/versioning (their params stay code/env-routed).
- The static agent prompts embed a fixed clause/domain list from `gapAnalysisPrompts.js`
  at seed time — reseed the Langfuse prompt if `CONTRACT_A30_CLAUSES` changes (the Git
  fallback stays in sync automatically).
