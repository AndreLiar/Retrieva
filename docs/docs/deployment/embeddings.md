---
sidebar_position: 8
---

# Embeddings (self-hosted Ollama)

RAG embeddings run on a **self-hosted Ollama** with the `bge-m3` model
(1024-dim). The chat LLM and embeddings use **different** Ollama endpoints.

## Why embeddings can't use Ollama Cloud ⚠️

Ollama Cloud (`https://ollama.com`) serves **chat/generate** but **not** the
embeddings API — `POST /api/embed` returns `{"error":"unauthorized"}` for every
model, even with valid keys (verified for both dev and prod keys). So
`OLLAMA_BASE_URL=https://ollama.com` works for the LLM but **not** for embeddings.

## Configuration

Two independent endpoints:

| Var | Used for | Value |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | chat LLM | `https://ollama.com` (Ollama Cloud) |
| `EMBEDDING_OLLAMA_BASE_URL` | embeddings | a self-hosted Ollama with `bge-m3` |

The code prefers `EMBEDDING_OLLAMA_BASE_URL` over `OLLAMA_BASE_URL`
(`config/embeddings.js`), so the LLM stays on the cloud while embeddings stay
local. Keep `EMBEDDING_MODEL=bge-m3:latest` — switching models/providers changes
the vector dimension and forces a full Qdrant re-index.

## Local dev (docker compose)

`docker compose` runs an `ollama` sidecar plus a one-shot `ollama-pull` that
fetches `bge-m3` into a named volume. The backend service overrides
`EMBEDDING_OLLAMA_BASE_URL=http://ollama:11434` (the sidecar's service name).

```bash
docker compose up -d            # ollama starts, bge-m3 is pulled, backend waits for it
```

For the backend run **on the host** (`npm run dev:backend`), `.env` uses
`EMBEDDING_OLLAMA_BASE_URL=http://localhost:11434`.

Verify:

```bash
curl -s http://localhost:11434/api/embed \
  -d '{"model":"bge-m3:latest","input":"test"}' | head -c 80
# -> {"model":"bge-m3:latest","embeddings":[[...]]}   (1024 numbers)
```

## Production

Run Ollama next to the API (sidecar container or a host process), pull `bge-m3`,
and set `EMBEDDING_OLLAMA_BASE_URL` in the prod env to point at it
(e.g. `http://ollama:11434` on the same network, or an internal host:port).
`OLLAMA_BASE_URL` stays on Ollama Cloud for the chat LLM.

> bge-m3 emits **1024-dim** vectors. The Qdrant collections are built at this
> dimension — do not change the embedding model without recreating/re-indexing
> them.
