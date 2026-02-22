---
sidebar_position: 2
---

# RAG Pipeline

The RAG (Retrieval-Augmented Generation) pipeline answers user questions by autonomously gathering context from the workspace knowledge base, DORA compliance articles, and completed vendor assessments.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAG Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌─────────────────────────────────┐   │
│  │  Query   │───▶│  Query   │───▶│        Agentic Retrieval        │   │
│  │  Input   │    │ Rephrase │    │   (LangGraph ReAct Agent)       │   │
│  └──────────┘    └──────────┘    └──────────────┬──────────────────┘   │
│                                                  │                       │
│                                       ┌──────────▼──────────┐           │
│                                       │  RRF Reranking       │           │
│                                       └──────────┬──────────┘           │
│                                                  │                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────────▼──────────────────┐   │
│  │ Response │◀───│  Answer  │◀───│  Context Compression + LLM Gen  │   │
│  │          │    │Validation│    │                                  │   │
│  └──────────┘    └──────────┘    └─────────────────────────────────┘   │
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
| "What about Article 30 exit rights?" | "We were reviewing vendor contracts" | "What are the Article 30 exit strategy requirements for ICT vendor contracts under DORA?" |

## Stage 2: Intent Classification

The system classifies queries into 10 intent types using a 3-tier approach (regex → keywords → LLM). Classification informs the LLM answer prompt style but does **not** gate retrieval — the agent always retrieves, then the prompt is tuned to the intent.

### Intent Types

| Intent | Description |
|--------|-------------|
| `factual` | Direct fact lookup |
| `comparison` | Compare items/concepts |
| `explanation` | Deep understanding |
| `aggregation` | Summarize/list all |
| `procedural` | How-to instructions |
| `clarification` | Needs more context |
| `chitchat` | Social conversation |
| `out_of_scope` | Unrelated to docs |
| `opinion` | Subjective question |
| `temporal` | Time-based query |

## Stage 3: Agentic Retrieval

Retrieval is handled by a **LangGraph ReAct agent** (`services/ragAgent.js`) that autonomously decides what to search and how many times. The agent has four tools:

### Agent Tools

| Tool | Description | Collection |
|------|-------------|------------|
| `search_knowledge_base` | Semantic search over workspace documents (policies, contracts, uploaded files) | `langchain-rag` (tenant-filtered) |
| `search_dora_articles` | Search DORA regulatory articles; optional domain filter | `compliance_kb` |
| `lookup_vendor_assessment` | Retrieve a completed gap analysis for a named ICT vendor | MongoDB |
| `done_searching` | Signal retrieval complete; triggers synthesis | — |

### Agent Retrieval Strategy

```
User question + last 4 conversation turns
        │
        ▼
 ┌──────────────────────────────────────┐
 │         RAG Agent (ReAct loop)        │
 │                                       │
 │  1. search_knowledge_base (2-3×)      │
 │  2. search_dora_articles (if needed)  │
 │  3. lookup_vendor_assessment (optional)│
 │  4. done_searching                    │
 │                                       │
 │  max 30 graph steps                   │
 └──────────────────────────────────────┘
        │
        ▼
 Collected docs (deduped by content prefix)
```

### Workspace Isolation

The knowledge base tool wraps every search with the workspace's Qdrant filter:

```javascript
// Enforced by wrapWithTenantIsolation on the vector store
const docs = await vectorStore.similaritySearch(query, k, qdrantFilter);
// qdrantFilter always includes { must: [{ key: 'metadata.workspaceId', match: workspaceId }] }
```

### DORA Domain Filtering

`search_dora_articles` supports optional domain filtering:

```javascript
// Agent may call with a specific domain
{ query: "subcontracting notification requirements", domain: "Third-Party Risk" }

// Or search all domains
{ query: "TLPT threat-led penetration testing requirements" }
```

Available domains: `General Provisions`, `ICT Risk Management`, `Incident Reporting`, `Resilience Testing`, `Third-Party Risk`, `ICT Third-Party Oversight`, `Information Sharing`.

## Stage 4: Reranking

After the agent finishes, all collected documents are passed through `rerankDocuments()` (Reciprocal Rank Fusion + BM25):

```javascript
const rerankedDocs = rerankDocuments(agentResult.documents, searchQuery, 15);
```

This caps the context at the top-15 most relevant chunks regardless of how many the agent collected across multiple tool calls.

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
