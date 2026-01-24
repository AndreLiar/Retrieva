# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js RAG (Retrieval-Augmented Generation) backend API built with Express 5, LangChain, Ollama, and Qdrant. The system performs **Notion-based** document retrieval and question-answering with:
- **Semantic block-aware chunking** (not character-based)
- **Heading path breadcrumbs** for navigation
- **RRF (Reciprocal Rank Fusion)** hybrid search
- Chat history support with conversation persistence

## Commands

### Development
```bash
npm run dev          # Start with auto-reload (nodemon)
npm start            # Production start
npm install --legacy-peer-deps  # Install dependencies (required flag)
```

### Qdrant Database Utilities
```bash
npm run qdrant:list         # List all points in collection
npm run qdrant:info         # Show collection info
npm run qdrant:collections  # List all collections
```

### Testing
```bash
# Test the RAG endpoint
curl -X POST http://localhost:3007/api/v1/rag \
  -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?"}'
```

### Prerequisites
- Ollama must be running locally (`ollama serve`)
- Required models: `ollama pull llama3.2` and `ollama pull nomic-embed-text`
- Qdrant must be running at `http://localhost:6333` (usually via Docker)

## Architecture

### RAG Pipeline Flow (Notion-Based)

The RAG system uses a sophisticated multi-step pipeline optimized for Notion:

1. **Document Ingestion** (workers/notionSyncWorker.js)
   - Fetches Notion pages via NotionAdapter
   - Groups blocks semantically (not by character count)
   - Tracks heading paths for breadcrumbs
   - Generates embeddings with Ollama's `nomic-embed-text` model
   - Stores in Qdrant with rich metadata (block types, heading paths, etc.)

2. **System Initialization** (services/rag.js:201-270)
   - Connects to existing Qdrant vector store (no document loading)
   - Creates retriever with k=15 for better coverage
   - Initializes query rephrasing, expansion, and HyDE chains
   - Sets up contextual compression chain

3. **Question Processing** (services/rag.js:397-503)
   - Fetches conversation history from MongoDB (last 20 messages)
   - Converts to LangChain Message objects (HumanMessage/AIMessage)
   - Uses `rephraseChain` to contextualize the question with history
   - **Multi-query expansion**: Generates query variations + HyDE hypothetical doc
   - Retrieves 15 docs per query variation (with optional Qdrant filters)
   - Deduplicates retrieved documents
   - **RRF hybrid re-ranking**: Combines semantic + BM25 keyword scores
   - **Contextual compression**: Extracts only relevant sentences
   - Formats context with page numbers and section headers
   - Generates answer using LLM
   - Saves question and answer to MongoDB

### Semantic Chunking Details

Unlike traditional character-based splitting, this system chunks by **semantic block groups**:

**Chunking Rules** (services/notionTransformer.js:385-553):
- Heading + following paragraphs → one chunk
- Consecutive list items → one chunk
- Toggle + children → standalone chunk
- Code block → standalone chunk (preserves language)
- Table rows → one chunk
- Callout → standalone chunk

**Target**: 300-700 tokens per chunk

**Metadata per chunk**:
```javascript
{
  block_type: "heading_group" | "list" | "code" | "table" | "callout",
  heading_path: ["Finance", "Invoices", "Approval Rules"],
  block_types_in_chunk: ["heading_2", "paragraph", "bulleted_list_item"],
  is_code: boolean,
  is_table: boolean,
  code_language: "javascript" | null,
  estimatedTokens: 450
}
```

**Benefits**:
- Chunks match how humans mentally organize information
- +20-30% retrieval precision
- Breadcrumb navigation in results
- Can filter by content type (code, tables, lists)

### Key Components

**RAG Service Singleton** (`services/rag.js`):
- Lazy initialization on first request
- Maintains retriever and rephraseChain instances
- History-aware query rephrasing for contextual retrieval
- Uses LangChain LCEL (LangChain Expression Language) with `.pipe()` for chain composition

**LangChain Configuration**:
- LLM: `llama3.2:latest` via Ollama (config/llm.js)
- Embeddings: `nomic-embed-text:latest` via Ollama (config/embeddings.js)
- Vector Store: Qdrant with collection name from env (config/vectorStore.js)
- Prompts: ChatPromptTemplate with MessagesPlaceholder for history (prompts/ragPrompt.js)

**Notion Integration**:
- **NotionAdapter** (`adapters/NotionAdapter.js`): Fetches pages and blocks via Notion API
- **NotionTransformer** (`services/notionTransformer.js`): Converts blocks to markdown + groups semantically
- **NotionDocumentLoader** (`loaders/notionDocumentLoader.js`):
  - **NEW**: `loadAndChunkNotionBlocks()` - Semantic chunking with rich metadata
  - **LEGACY**: `loadAndSplitNotionDocument()` - Character-based (for backward compatibility)
- **NotionSyncWorker** (`workers/notionSyncWorker.js`): Background sync job for document ingestion

**PDF Support** (loaders/documentLoader.js):
- Legacy PDF loading available but NOT the primary use case
- Use `loadAndSplitDocs()` if needed for PDFs
- **Primary source is Notion**

**Express Middleware Stack** (app.js):
- CORS enabled for all origins
- Helmet for security headers
- Rate limiting: 100 req/hour per IP on `/api/*`
- Morgan logger → Winston stream
- Body parser with 10kb limit
- Express 5 incompatibility: `express-mongo-sanitize` and `xss-clean` disabled

**Utilities Library** (`utils/index.js`):
- Centralized exports for all helpers
- Import via `import { catchAsync, AppError } from './utils/index.js'`
- Categories: errorHandler, validators, responseFormatter, stringHelpers, dateHelpers, asyncHelpers

### Response Format

All API responses use standardized format (utils/responseFormatter.js):
```javascript
// Success
{ status: "success", message: "...", data: {...} }

// Error
{ status: "error", message: "..." }
```

Use `sendSuccess(res, statusCode, message, data)` and `sendError(res, statusCode, message)`

### Error Handling

- Async route handlers wrapped with `catchAsync()` utility
- Global error handler at app.js:258
- Custom AppError class for operational errors
- All errors logged via Winston

### Logging

Winston logger configured in config/logger.js:
- Development: colorized console output
- Production: JSON file format (combined.log, error.log)
- Rotation: 5MB max, 5 files
- Morgan streams HTTP requests to Winston

## Important Notes

### LangChain Version Changes
The codebase uses modern LangChain imports:
- **Use**: `@langchain/ollama` for ChatOllama and OllamaEmbeddings
- **Use**: `@langchain/core/runnables` for RunnableSequence/RunnablePassthrough
- **Avoid**: Deprecated `langchain/chains` and `@langchain/community/chat_models/ollama`

### Express 5 Compatibility
- `express-mongo-sanitize` and `xss-clean` are installed but disabled
- Do not attempt to enable them without Express 5 compatible versions

### Vector Store Initialization
- Vector store is created lazily on first `/api/v1/rag` request
- Reindexing requires restarting the server or clearing the collection
- Qdrant storage persists in `qdrant_storage/` directory

### Chat History Format
The API expects chat_history as:
```javascript
[
  { role: "user", content: "..." },
  { role: "assistant", content: "..." }
]
```

Internally converted to LangChain's HumanMessage/AIMessage objects.

## Common Patterns

### Adding New Routes
1. Create controller in `controllers/`
2. Create route file in `routes/`
3. Import and use in `app.js` with appropriate middleware
4. Update Swagger documentation in `app.js` (inline OpenAPI spec)

### Adding Utilities
1. Create utility file in `utils/`
2. Export functions
3. Add exports to `utils/index.js`
4. Import via central utils index

### Adding/Updating Notion Documents
1. Documents are synced via `workers/notionSyncWorker.js`
2. New Notion pages are automatically indexed when detected
3. To force re-indexing:
   ```bash
   npm run qdrant:collections  # Clear collection if needed
   # Restart sync worker or trigger manual sync
   ```
4. Verify semantic chunking is active by checking logs for:
   - "Using semantic block-based chunking"
   - "Created X semantic groups"

### Documentation
- **Quick Reference**: `docs/IMPLEMENTATION_COMPLETE.md`
- **Detailed Guide**: `docs/SEMANTIC_CHUNKING_OPTIMIZATION.md`
- **Performance Tips**: `docs/OPTIMIZATION_GUIDE.md`
- **Setup Instructions**: `README.md` (root)
