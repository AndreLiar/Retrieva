w# Notion RAG Setup Guide

## Overview

This guide explains how to set up and use the Notion-based RAG system with semantic chunking. This system is specifically optimized for Notion pages, not PDFs.

---

## ✅ What You Have Now

Your system includes:

- ✅ **Semantic block-aware chunking** (groups by meaning, not characters)
- ✅ **Heading path breadcrumbs** (e.g., "Finance › Invoices › Rules")
- ✅ **RRF hybrid search** (combines semantic + keyword ranking)
- ✅ **Rich metadata** (block types, code language, table flags)
- ✅ **Multi-query expansion** + HyDE hypothetical documents
- ✅ **Contextual compression** (extracts only relevant content)

---

## 🚀 Quick Start

### 1. Prerequisites

Ensure you have:

```bash
# Ollama running with required models
ollama serve
ollama pull llama3.2
ollama pull nomic-embed-text

# Qdrant running (Docker recommended)
docker run -p 6333:6333 qdrant/qdrant

# MongoDB running (for conversation history)
# Check your .env for MONGODB_URI

# Node.js 18+ installed
node --version  # Should be 18+
```

### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
```

**Note**: The `--legacy-peer-deps` flag is required due to Express 5.

### 3. Configure Environment

Create/update `.env`:

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=notion_documents

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rag_db

# Notion (for document ingestion)
NOTION_API_KEY=your_notion_integration_token
NOTION_WORKSPACE_ID=your_workspace_id

# Server
PORT=3007
NODE_ENV=development
```

### 4. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 5. Verify System

```bash
# Check Qdrant collections
npm run qdrant:collections

# Test RAG endpoint
curl -X POST http://localhost:3007/api/v1/rag \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the main topics?",
    "conversationId": "test-123"
  }'
```

---

## 📚 Document Ingestion (Notion → Qdrant)

### How Documents Are Indexed

1. **Notion API** → Fetch pages and blocks
2. **NotionAdapter** → Extract content and metadata
3. **NotionTransformer** → Group blocks semantically
4. **NotionDocumentLoader** → Create chunks with rich metadata
5. **Qdrant** → Store embeddings + metadata

### Triggering Indexing

**Option A: Via Sync Worker** (Recommended)

```javascript
// workers/notionSyncWorker.js handles automatic syncing
// Check worker logs for sync status
```

**Option B: Manual Indexing**

```javascript
import { NotionAdapter } from './adapters/NotionAdapter.js';
import { prepareNotionDocumentForIndexing } from './loaders/notionDocumentLoader.js';
import { getVectorStore } from './config/vectorStore.js';

// Authenticate
const adapter = new NotionAdapter();
await adapter.authenticate(process.env.NOTION_API_KEY);

// Fetch document with blocks
const document = await adapter.fetchDocument(pageId);

// Extract metadata
const metadata = await adapter.extractMetadata(document);

// Chunk semantically
const chunks = await prepareNotionDocumentForIndexing(
  metadata,
  workspaceId,
  document.blocks  // ← Critical: pass blocks for semantic chunking
);

// Store in Qdrant
const vectorStore = await getVectorStore([]);
await vectorStore.addDocuments(chunks);

console.log(`✅ Indexed ${chunks.length} semantic chunks`);
```

### Verifying Semantic Chunking

Check logs for:
```
✅ "Using semantic block-based chunking"
✅ "Created X semantic groups"
✅ "Semantic chunking complete"
```

Query a document and check metadata:
```javascript
{
  "block_type": "heading_group",
  "heading_path": ["Finance", "Invoices", "Approval Rules"],
  "is_code": false,
  "estimatedTokens": 450
}
```

---

## 🔍 Using the RAG Service

### Basic Query

```javascript
import { ragService } from './services/rag.js';

// Create conversation
const conversation = await Conversation.create({
  userId: 'user-123',
  title: 'Invoice Questions'
});

// Ask question
const answer = await ragService.askWithConversation(
  "What are invoice approval rules?",
  conversation._id.toString()
);

console.log(answer);
```

### Query with Filters

Filter by block type, heading path, or other metadata:

```javascript
const filters = {
  must: [
    { key: 'is_code', match: { value: true } }
  ]
};

const answer = await ragService.askWithConversation(
  "Show me the authentication function",
  conversationId,
  filters
);
```

### Available Filters

```javascript
// Filter by block type
{ key: 'block_type', match: { value: 'code' } }
{ key: 'is_table', match: { value: true } }
{ key: 'is_list', match: { value: true } }

// Filter by heading path (any match)
{ key: 'heading_path', match: { any: ["Finance", "Invoices"] } }

// Filter by code language
{ key: 'code_language', match: { value: 'javascript' } }

// Filter by page
{ key: 'documentTitle', match: { value: 'API Documentation' } }

// Filter by date
{ key: 'lastModified', range: { gte: '2025-01-01' } }
```

---

## 📊 Understanding the Results

### Response Format

```javascript
{
  "answer": "Invoices above €5,000 require manual validation...",
  "metadata": {
    "sources": [
      {
        "pageTitle": "Finance Policies",
        "heading_path": ["Finance", "Invoices", "Approval Rules"],
        "block_type": "heading_group",
        "url": "https://notion.so/...",
        "score": 0.8542
      }
    ],
    "retrievedDocs": 15,
    "rerankedDocs": 5,
    "tokensUsed": 2341
  }
}
```

### Interpreting Metadata

- **heading_path**: Breadcrumb navigation (e.g., Finance › Invoices › Rules)
- **block_type**: Type of content (heading_group, list, code, table, callout)
- **score**: RRF hybrid score (semantic + keyword combined)
- **is_code/is_table/is_list**: Content type flags
- **estimatedTokens**: Approximate size of chunk

---

## 🎯 Best Practices

### 1. Document Structure in Notion

For best results, structure your Notion pages with:

- ✅ Clear heading hierarchy (H1 → H2 → H3)
- ✅ Consistent bullet/numbered lists for related items
- ✅ Code blocks with language specified
- ✅ Tables for structured data
- ✅ Callouts for important notes

### 2. Query Patterns

**Exact References** (benefits from keyword search):
```javascript
"GDPR article 32"
"invoice above 5k"
"SOC2 compliance"
```

**Semantic Questions** (benefits from vector search):
```javascript
"how do we handle late payments?"
"who approves large expenses?"
"what happens when a contract is canceled early?"
```

**Code Queries** (use filters):
```javascript
const answer = await ragService.askWithConversation(
  "Show me the authentication function",
  conversationId,
  { must: [{ key: 'is_code', match: { value: true } }] }
);
```

### 3. Conversation Management

```javascript
// Create conversation
const conversation = await Conversation.create({
  userId: 'user-123',
  title: 'Finance Questions',
  messageCount: 0
});

// Multiple questions in context
await ragService.askWithConversation("What are invoice rules?", conversation._id);
await ragService.askWithConversation("What about amounts over 5k?", conversation._id);
// ↑ Second question uses context from first
```

### 4. Re-indexing Strategy

When to re-index:

- ✅ After major Notion page updates
- ✅ When changing chunking settings
- ✅ After system upgrades
- ❌ Not needed for minor text edits (delta sync can handle)

```bash
# Clear collection
npm run qdrant:collections

# Restart sync worker or trigger manual sync
```

---

## 🔧 Troubleshooting

### Issue: No results returned

**Check**:
1. Is Qdrant running? `curl http://localhost:6333`
2. Are documents indexed? `npm run qdrant:info`
3. Is RAG service initialized? Check logs for "RAG system initialized"

**Solution**:
```bash
# Verify Qdrant has documents
npm run qdrant:list

# Check collection
npm run qdrant:collections
```

### Issue: "Using legacy character-based chunking"

**Cause**: Blocks not passed to `prepareNotionDocumentForIndexing()`

**Solution**: Update indexing code:
```javascript
// ❌ Wrong (no blocks)
const chunks = await prepareNotionDocumentForIndexing({ content, ...metadata }, wsId);

// ✅ Correct (with blocks)
const chunks = await prepareNotionDocumentForIndexing(metadata, wsId, document.blocks);
```

### Issue: No heading_path in results

**Cause**: Either using legacy chunking or page has no headings

**Solution**:
1. Verify semantic chunking is active (check logs)
2. Add headings to your Notion pages
3. Re-index documents

### Issue: Poor retrieval quality

**Check**:
1. Query phrasing (try different phrasings)
2. Document structure (clear headings help)
3. Chunk metadata (use filters to narrow scope)

**Optimize**:
```javascript
// Expand search scope
const answer = await ragService.askWithConversation(
  query,
  conversationId,
  null  // No filters = broader search
);

// Or narrow scope
const answer = await ragService.askWithConversation(
  query,
  conversationId,
  { must: [{ key: 'heading_path', match: { any: ["Finance"] } }] }
);
```

---

## 📈 Performance Tips

### 1. Indexing Performance

- **Batch indexing**: Index multiple pages in parallel
- **Incremental sync**: Only re-index changed pages
- **Depth limit**: Set `MAX_RECURSION_DEPTH` env var (default: 3)

### 2. Query Performance

- **Use filters**: Narrow search scope with metadata filters
- **Adjust k**: Reduce retrieval count if slow (`k: 10` instead of `k: 15`)
- **Cache conversations**: MongoDB conversation caching already implemented

### 3. Memory Usage

- **Chunk size**: Target 300-700 tokens (already optimized)
- **Retrieval limit**: Don't retrieve more than 20 docs per query
- **Compression**: Contextual compression is enabled by default

---

## 🧪 Testing

### Run Validation Tests

```bash
node tests/notionSemanticChunkingTests.js
```

**Update test queries** to match your Notion workspace:

```javascript
// In tests/notionSemanticChunkingTests.js
const GOLD_QUERIES = [
  {
    query: "invoice above 5k",
    expectedPage: "Invoice Approval Process",  // ← Use your actual page title
    type: "exact_reference"
  },
  // ... add more queries
];
```

### Expected Test Results

- ✅ Top-1 Accuracy: ≥80%
- ✅ Breadcrumb Presence: 100%
- ✅ Code Block Identification: 100% (for code queries)

---

## 📚 Further Reading

- **Quick Reference**: [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)
- **Detailed Technical Guide**: [SEMANTIC_CHUNKING_OPTIMIZATION.md](./SEMANTIC_CHUNKING_OPTIMIZATION.md)
- **Performance Optimization**: [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md)
- **Project Setup**: [../README.md](../README.md)
- **Claude Code Guide**: [../CLAUDE.md](../CLAUDE.md)

---

## 🆘 Support

1. Check logs: `logs/combined.log` and `logs/error.log`
2. Run tests: `node tests/notionSemanticChunkingTests.js`
3. Verify setup: Use troubleshooting section above
4. Review docs: See "Further Reading" section

---

**Last Updated**: 2026-01-11
**System Version**: Notion RAG v2.0 (Semantic Chunking)
**Compatibility**: Node.js 18+, Notion API 2022+, Qdrant 1.7+
