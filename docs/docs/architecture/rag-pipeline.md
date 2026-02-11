---
sidebar_position: 2
---

# RAG Pipeline

The RAG (Retrieval-Augmented Generation) pipeline is the core of the platform, responsible for answering user questions using retrieved context from their Notion workspace.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAG Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  Query   │───▶│  Intent  │───▶│ Retrieval│───▶│    Reranking     │  │
│  │  Input   │    │ Classify │    │          │    │                  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘  │
│                                                           │              │
│  ┌──────────────────────────────────────────────────────┐│              │
│  │                                                       ▼│              │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  │ Response │◀───│  Answer  │◀───│   LLM    │◀───│ Context  │      │
│  │  │          │    │Validation│    │Generation│    │Compression│     │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Stage 1: Query Processing

### Query Rephrasing

For conversational context, queries are rephrased to be standalone:

```javascript
// services/rag.js
const historyAwarePrompt = ChatPromptTemplate.fromMessages([
  new MessagesPlaceholder('chat_history'),
  ['user', '{input}'],
  ['user', 'Generate a search query to find relevant information'],
]);

const rephrased = await rephraseChain.invoke({
  input: question,
  chat_history: history,
});
```

**Example:**

| Original | With History | Rephrased |
|----------|-------------|-----------|
| "What about the approval process?" | "Tell me about expense policies" | "What is the expense approval process?" |

## Stage 2: Intent Classification

The system classifies queries into 10 intent types using a 3-tier approach:

### Tier 1: Regex Patterns (Fast)

```javascript
const QUICK_PATTERNS = {
  COMPARISON: /\b(compare|versus|vs\.?|difference|better|worse)\b/i,
  PROCEDURAL: /\b(how (do|can|to|should)|steps|process|guide)\b/i,
  AGGREGATION: /\b(all|every|list|summarize|overview)\b/i,
  // ...
};
```

### Tier 2: Keyword Scoring (Medium)

```javascript
const KEYWORD_SIGNALS = {
  FACTUAL: {
    positive: ['what is', 'define', 'meaning', 'who is'],
    negative: ['compare', 'difference'],
  },
  // ...
};
```

### Tier 3: LLM Classification (Accurate)

For ambiguous queries, GPT-4o-mini classifies the intent with reasoning.

### Intent Types

| Intent | Description | Retrieval Strategy |
|--------|-------------|-------------------|
| `factual` | Direct fact lookup | focused (k=5) |
| `comparison` | Compare items/concepts | multi-aspect (k=10) |
| `explanation` | Deep understanding | deep (k=8) |
| `aggregation` | Summarize/list all | broad (k=15) |
| `procedural` | How-to instructions | focused (k=6) |
| `clarification` | Needs more context | context-only |
| `chitchat` | Social conversation | no-retrieval |
| `out_of_scope` | Unrelated to docs | no-retrieval |
| `opinion` | Subjective question | focused (k=5) |
| `temporal` | Time-based query | focused (k=6) |

## Stage 3: Document Retrieval

### Hybrid Search

Combines semantic and keyword search:

```javascript
// Semantic search (dense vectors)
const semanticResults = await vectorStore.similaritySearch(query, k, {
  filter: { workspaceId: workspaceId }
});

// Keyword search (sparse vectors)
const sparseResults = await sparseVectorManager.search(query, workspaceId, k);

// RRF Fusion
const fusedResults = reciprocalRankFusion([semanticResults, sparseResults]);
```

### Workspace Isolation

Every query MUST include workspace filter:

```javascript
function buildQdrantFilter(filters, workspaceId) {
  if (!workspaceId) {
    throw new Error('workspaceId is required for vector store queries');
  }

  return {
    must: [
      { key: 'metadata.workspaceId', match: { value: workspaceId } },
      // Additional filters...
    ]
  };
}
```

## Stage 4: Reranking

### Cross-Encoder Reranking

```javascript
const rerankedDocs = await crossEncoderRerank(documents, query, {
  topK: 10,
  threshold: 0.3,
});
```

### BM25 Scoring

```javascript
const bm25Scores = calculateBM25Scores(documents, query);
const combined = documents.map((doc, i) => ({
  ...doc,
  score: 0.7 * doc.semanticScore + 0.3 * bm25Scores[i],
}));
```

## Stage 5: Context Compression

Large contexts are compressed to fit LLM context windows:

```javascript
const compressedDocs = await compressDocuments(documents, query, {
  maxTokens: 4000,
  preserveCitations: true,
});
```

## Stage 6: Answer Generation

### Prompt Structure

```javascript
const ragPrompt = ChatPromptTemplate.fromMessages([
  ['system', `
    You are an expert AI assistant with access to the user's Notion workspace.

    CRITICAL INSTRUCTIONS:
    1. Use ONLY information from provided context
    2. ALWAYS cite sources using [Source N] format
    3. If information not found, say so
    4. NEVER invent or hallucinate information

    CONTEXT:
    {context}
  `],
  new MessagesPlaceholder('chat_history'),
  ['human', '<user_question>{input}</user_question>'],
]);
```

### Streaming Response

Responses are streamed via SSE for real-time display:

```javascript
const stream = await chain.stream({
  context: formattedContext,
  input: question,
  chat_history: history,
});

for await (const chunk of stream) {
  emit('chunk', { text: chunk });
}
```

## Stage 7: Answer Validation

### LLM Judge

A separate LLM evaluates the answer:

```javascript
const evaluation = await evaluateAnswer(question, answer, sources, context);

// Returns:
{
  isGrounded: boolean,      // Supported by sources?
  hasHallucinations: boolean, // Contains invented info?
  isRelevant: boolean,      // Addresses the question?
  confidence: number,       // 0-1 score
  citedSourceNumbers: number[],
}
```

### Hallucination Blocking

```javascript
if (validation.hasHallucinations) {
  // Replace with fallback message
  return "I wasn't able to find reliable information about this topic.";
}
```

### Citation Validation

```javascript
const citationResult = processCitations(answer, sources, {
  removeInvalid: true,  // Remove [Source 99] if only 5 sources
});
```

## Stage 8: Response Processing

### Output Sanitization

```javascript
const sanitized = sanitizeLLMOutput(answer, {
  encodeHtml: true,
  removeDangerous: true,
  preserveMarkdown: true,
});
```

### PII Detection

```javascript
const piiScan = scanOutputForSensitiveInfo(answer, {
  maskSensitive: true,
});
```

### Caching

Successful responses are cached by workspace:

```javascript
await cache.set(question, result, workspaceId, conversationId);
```

## Performance Metrics

| Stage | Typical Latency | Notes |
|-------|----------------|-------|
| Intent Classification | 50-200ms | Regex/keywords: &lt;10ms |
| Document Retrieval | 100-300ms | Depends on collection size |
| Reranking | 50-150ms | Cross-encoder is slowest |
| Context Compression | 200-500ms | LLM-based compression |
| Answer Generation | 1-5s | Streaming reduces perceived latency |
| Answer Validation | 300-800ms | LLM Judge evaluation |

## Configuration

Key environment variables:

```bash
# Retrieval
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=notion_documents
RETRIEVAL_TOP_K=10

# LLM
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2:latest
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=2048

# Timeouts
LLM_INVOKE_TIMEOUT=60000
LLM_STREAM_INITIAL_TIMEOUT=30000
LLM_STREAM_CHUNK_TIMEOUT=10000

# Quality
MIN_CONFIDENCE_THRESHOLD=0.4
ENABLE_HALLUCINATION_BLOCKING=true
```

## Error Handling

The pipeline handles errors gracefully:

```javascript
try {
  const result = await ragService.askWithConversation(question, options);
  return result;
} catch (error) {
  if (error instanceof LLMTimeoutError) {
    // Return partial response if available
  }
  if (error.isValidationError) {
    // Return 400 with validation message
  }
  // Log and return generic error
}
```
