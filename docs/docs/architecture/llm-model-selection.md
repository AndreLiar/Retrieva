---
sidebar_position: 5
---

# LLM Model Selection

Retrieva runs on **Ollama cloud** (`https://ollama.com`) with three API keys in rotation — when one key hits its rate limit, the next is tried automatically via LangChain's `withFallbacks()`. This page documents the benchmark analysis used to select the active model.

## Use Case Requirements

The platform has five distinct LLM workloads, each with different demands:

| Task | Service | Temperature | Max tokens | Key demand |
|---|---|---|---|---|
| DORA gap analysis | `gapAnalysisAgent.js` | 0 | 4096 | Structured JSON, legal reasoning |
| RAG Q&A (streaming) | `rag.js` | 0.3 | 2000 | Instruction following, citations |
| Cross-encoder re-ranking | `crossEncoderRerank.js` | 0.1 | 2048 | Binary relevance scoring, speed |
| Questionnaire scoring | `questionnaireScorer.js` | 0 | 150–500 | Consistent 0–100 scoring |
| LLM judge (eval) | `llmJudge.js` | 0.1 | 500 | Calibrated, reproducible |

**Hard constraints:**
- Temperature=0 with reliable **structured JSON output** up to 4096 tokens (gap analysis is the bottleneck)
- Accurate reading of **EU regulatory vocabulary** (DORA is originally a multilingual EU regulation)
- **128k context window** to handle k=15 retrieved chunks plus conversation history
- Compatible with Ollama cloud API (Bearer token auth, `/api/generate` endpoint)

---

## Model Benchmark Comparison

Scores sourced from public leaderboards (MMLU, IFEval, Open LLM Leaderboard). "JSON reliability" is assessed from published structured-output benchmarks and community reports.

| Model | MMLU | IFEval (instruction follow) | Context | JSON reliability | Speed | Overall |
|---|---|---|---|---|---|---|
| `llama3.2:3b` | 63% | 72% | 128k | Weak — drops structure on long outputs | ★★★★★ | ❌ Too small for 4096-token gap reports |
| `llama3.1:8b` | 73% | 80% | 128k | Good | ★★★★ | ✅ Solid, good for latency-sensitive paths |
| `llama3.3:70b` | 86% | 92% | 128k | Excellent | ★★ | ✅ Best reasoning — too slow for streaming |
| `mistral:7b` | 64% | 74% | 32k | Decent | ★★★★ | ⚠️ Weaker on legal text, short context |
| `mistral-nemo:12b` | 68% | 79% | 128k | Good | ★★★ | ✅ European-context advantage |
| `qwen2.5:7b` | 74% | 85% | 128k | Very strong — best JSON at 7B class | ★★★★ | ✅ Strong contender |
| **`qwen2.5:14b`** | **79%** | **89%** | **128k** | **Excellent** | **★★★** | **✅ Selected** |
| `gemma2:9b` | 71% | 82% | 8k | Good | ★★★★ | ❌ Context window too small |
| `deepseek-r1:7b` | 70% | 78% | 128k | Moderate | ★★★★ | ⚠️ Verbose reasoning traces add latency |
| `phi3.5:3.8b` | 69% | 78% | 128k | Decent | ★★★★★ | ❌ Too small for 4096-token outputs |

---

## Selection: `qwen2.5:14b`

### Why Qwen 2.5 14B

**1. Structured output reliability at temperature=0**
Gap analysis is the most demanding task — it must emit a structured JSON report with Critical / High / Medium / Low gaps mapped to specific DORA articles, up to 4096 tokens, at temperature=0. Qwen 2.5 leads all sub-20B models on structured output benchmarks, significantly outperforming Llama 3.1 8B and Mistral variants on format adherence in long generations.

**2. Highest IFEval score in its size class**
The RAG and gap analysis prompts are long and multi-step. Qwen 2.5 14B scores 89% on IFEval (instruction-following eval), the highest of any model under 20B parameters with a 128k context window.

**3. 128k context window**
The RAG pipeline retrieves k=15 chunks plus conversation history. At ~500 tokens per chunk, that's 7500+ tokens of context before the system prompt. 128k ensures no truncation even on the largest workspaces.

**4. Regulatory vocabulary coverage**
DORA (Digital Operational Resilience Act, Regulation EU 2022/2554) originates in multilingual EU regulatory language. Qwen 2.5 was trained on a broad multilingual corpus including legal and financial text, giving it better out-of-the-box understanding of EBA/ESMA/EIOPA RTS references compared to primarily English-trained models.

**5. Acceptable streaming speed**
At approximately 25 tokens/second on Ollama cloud, `qwen2.5:14b` streams comfortably for the RAG Q&A path. The gap analysis pipeline is fully async via BullMQ workers, so generation latency there is irrelevant to user experience.

### Runner-up: `llama3.1:8b`

If streaming latency becomes a concern on the RAG Q&A path specifically, `llama3.1:8b` is the alternative — it is approximately 2× faster while maintaining acceptable instruction-following quality for conversational responses. It is not recommended for gap analysis due to lower JSON reliability on 4096-token structured outputs.

---

## Key Rotation & Rate Limit Handling

Three Ollama cloud API keys are configured in `backend/.env`:

```
OLLAMA_API_KEY_1=...
OLLAMA_API_KEY_2=...
OLLAMA_API_KEY_3=...
```

The `createOllamaLLM()` factory in `config/llmProvider.js` builds one `ChatOllama` instance per key, each with `Authorization: Bearer <key>` in the request headers, then chains them via `withFallbacks()`:

```
Request → key 1 → (429 rate limit) → key 2 → (429 rate limit) → key 3
```

This is transparent to all callers — `rag.js`, `gapAnalysisAgent.js`, `crossEncoderRerank.js`, and `questionnaireScorer.js` all call `getDefaultLLM()` / `createLLM()` without any awareness of which key is active.

---

## Changing the Model

Update `LLM_MODEL` and `JUDGE_LLM_MODEL` in `backend/.env`:

```bash
LLM_MODEL=qwen2.5:14b        # Main LLM (RAG, gap analysis, re-ranking)
JUDGE_LLM_MODEL=qwen2.5:14b  # Evaluation judge (llmJudge.js)
```

Any model available on [ollama.com/models](https://ollama.com/models) can be used. Ensure:
- Context window ≥ 32k
- Model supports instruction following (chat template, not base)
- Tested with `temperature=0` structured JSON output before switching gap analysis
