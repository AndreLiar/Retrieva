# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready RAG (Retrieval-Augmented Generation) backend API built with Express 5, LangChain, Ollama, and Qdrant. It provides question-answering capabilities with document retrieval, primarily ingesting content from Notion workspaces.

## Common Commands

```bash
# Install dependencies (note: legacy-peer-deps required)
npm install --legacy-peer-deps

# Development server with auto-reload
npm run dev

# Production server
npm start

# Run workers separately (if needed)
npm run workers
npm run workers:dev

# Qdrant utilities
npm run qdrant:list        # List documents in vector store
npm run qdrant:info        # Get collection info
npm run qdrant:collections # List all collections
```

## Required Services

Before starting the server, ensure these services are running:
- **MongoDB**: `mongodb://localhost:27017`
- **Redis**: `redis://localhost:6378`
- **Qdrant**: `http://localhost:6333`
- **Ollama**: `http://localhost:11434` with models `llama3.2:latest` and `nomic-embed-text:latest`

## Architecture

### Entry Points
- `index.js` - Server entry point: connects to MongoDB, initializes workers, pre-warms RAG system, starts Express
- `app.js` - Express app configuration: middleware setup, route mounting, Swagger docs

### Key Design Patterns

**Request Flow**: Routes -> Controllers -> Services -> Models/Config

**Workers (BullMQ)**: Background job processing runs alongside the API server
- `workers/notionSyncWorker.js` - Syncs Notion pages to vector store
- `workers/documentIndexWorker.js` - Indexes documents in Qdrant (concurrency: 20, batch size: 10)

**RAG System** (`services/rag.js`):
- Pre-warmed at startup to eliminate first-request delay
- Uses history-aware retrieval for contextual conversations
- Implements answer validation with confidence scoring
- Caches responses via `utils/ragCache.js`

### Directory Structure

- `config/` - Service configurations (database, LLM, embeddings, vector store, Redis, queue)
- `services/` - Business logic (RAG, Notion OAuth, sync scheduling, answer formatting)
- `controllers/` - Request handlers
- `routes/` - API endpoint definitions
- `models/` - Mongoose schemas (User, Conversation, Message, Analytics, NotionWorkspace, SyncJob, DocumentSource)
- `utils/` - Utility functions (error handling, validators, response formatters, async helpers)
- `workers/` - BullMQ job processors
- `middleware/` - Express middleware
- `prompts/` - LLM prompt templates

### API Endpoints

- `POST /api/v1/rag` - Ask a question (main RAG endpoint)
- `GET/POST/PATCH/DELETE /api/v1/conversations` - Conversation CRUD
- `POST /api/v1/conversations/:id/ask` - Ask within conversation context
- `/api/v1/auth` - Authentication endpoints
- `/api/v1/notion` - Notion integration endpoints
- `/api/v1/analytics` - Analytics endpoints
- `/health` - Health check (no /api prefix for Kubernetes probes)
- `/api-docs` - Swagger UI

## Code Conventions

- ES6 modules (`"type": "module"` in package.json)
- Async/await throughout
- Use `catchAsync` wrapper for async route handlers
- Use `AppError` for custom errors with status codes
- Response formatting via `sendSuccess`/`sendError` from `utils/index.js`
- Winston logger for all logging (access via `import logger from './config/logger.js'`)
- **Maximum 500 lines per file**: Keep files under 500 lines of code. If a file exceeds this limit, refactor by extracting related functionality into separate modules. This improves readability, maintainability, and testability.

## Known Limitations

- `express-mongo-sanitize` and `xss-clean` are disabled due to Express 5 incompatibility
- Rate limiting skips `/sync-status` endpoint for monitoring purposes
