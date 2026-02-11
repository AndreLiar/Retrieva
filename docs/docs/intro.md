---
sidebar_position: 1
slug: /
---

# RAG Platform Documentation

Welcome to the **RAG (Retrieval-Augmented Generation) Platform** documentation. This platform provides a production-ready solution for building intelligent question-answering systems powered by your Notion workspace.

## What is this Platform?

The RAG Platform is a full-stack application that combines:

- **Notion Integration**: Automatically syncs and indexes your Notion workspace
- **Semantic Search**: Uses vector embeddings for intelligent document retrieval
- **LLM-Powered Answers**: Generates accurate, cited answers using Azure OpenAI (GPT-4o-mini)
- **Multi-Tenant Architecture**: Secure workspace isolation for multiple users
- **Real-Time Streaming**: SSE-based streaming for responsive UI

## Key Features

### Intelligent RAG Pipeline

```
User Question → Intent Classification → Retrieval Strategy → Document Retrieval
     → Reranking → Context Compression → LLM Generation → Answer Validation
```

### 3-Tier Intent Classification

The system classifies user queries into 10 intent types using a cascading approach:

1. **Regex Patterns** - Fast pattern matching for common intents
2. **Keyword Scoring** - Weighted keyword analysis
3. **LLM Classification** - GPT-4o-mini classification for ambiguous queries

### Semantic Document Chunking

Documents are intelligently chunked based on:
- Block type awareness (headings, lists, code, tables)
- Heading path preservation for context
- Token-based size optimization (200-400 tokens)

### Multi-Layer Security

- JWT-based authentication with refresh tokens
- Workspace-level authorization (RBAC)
- Database-level tenant isolation
- LLM output guardrails and hallucination detection

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Express 5, Node.js 20+ |
| AI Orchestration | LangChain (LCEL chains, prompts, parsers) |
| LLM | Azure OpenAI (GPT-4o-mini) |
| Embeddings | Azure OpenAI (text-embedding-3-small) |
| Vector Store | Qdrant (via @langchain/qdrant) |
| Database | MongoDB (Mongoose ODM) |
| Cache/Queue | Redis, BullMQ |
| Real-Time | Socket.io |
| Frontend | Next.js 15, React, TypeScript |
| UI Components | shadcn/ui, Tailwind CSS |
| Monitoring | LangSmith, RAGAS |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│                     API Gateway (Express 5)                     │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│   RAG        │   Notion     │   Auth       │   Analytics       │
│   Service    │   Sync       │   Service    │   Service         │
├──────────────┴──────────────┴──────────────┴───────────────────┤
│                    Background Workers (BullMQ)                  │
├──────────────┬──────────────┬──────────────────────────────────┤
│   Qdrant     │   MongoDB    │           Redis                  │
│   (Vectors)  │   (Data)     │       (Cache/Queue)              │
└──────────────┴──────────────┴──────────────────────────────────┘
```

## Quick Links

- [Getting Started](/getting-started) - Set up the platform locally
- [Architecture Overview](/architecture/overview) - Understand the system design
- [API Reference](/api/overview) - Explore the REST API
- [Security](/security/overview) - Learn about security measures
- [Deployment](/deployment/docker) - Deploy to production
