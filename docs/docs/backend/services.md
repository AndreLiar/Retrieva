---
sidebar_position: 2
---

# Services

Services contain the core business logic of the application. They are called by controllers and interact with models, external APIs, and other services.

## Core Services

### RAG Service (`services/rag.js`)

The main RAG orchestration service.

```javascript
class RAGService {
  constructor(dependencies = {}) {
    this.llm = dependencies.llm || null;
    this.vectorStoreFactory = dependencies.vectorStoreFactory;
    this.cache = dependencies.cache;
    this.answerFormatter = dependencies.answerFormatter;
    this.logger = dependencies.logger;
  }

  async init() {
    // Initialize LLM, vector store, and chains
  }

  async askWithConversation(question, options) {
    // Main entry point for RAG queries
    // 1. Check cache
    // 2. Route query (intent classification)
    // 3. Retrieve documents
    // 4. Generate answer
    // 5. Validate answer
    // 6. Cache and return
  }
}
```

**Key Methods:**

| Method | Description |
|--------|-------------|
| `init()` | Initialize LLM and vector store |
| `askWithConversation()` | Process RAG query with conversation context |
| `_rephraseQuery()` | Rephrase query for standalone search |
| `_prepareContext()` | Format documents for LLM context |
| `_generateAnswer()` | Generate answer with streaming support |
| `_processAnswer()` | Validate answer with LLM Judge |

### Intent Classifier (`services/intent/intentClassifier.js`)

Classifies user queries into intent types.

```javascript
export const IntentType = {
  FACTUAL: 'factual',
  COMPARISON: 'comparison',
  EXPLANATION: 'explanation',
  AGGREGATION: 'aggregation',
  PROCEDURAL: 'procedural',
  CLARIFICATION: 'clarification',
  CHITCHAT: 'chitchat',
  OUT_OF_SCOPE: 'out_of_scope',
  OPINION: 'opinion',
  TEMPORAL: 'temporal',
};

export async function classifyIntent(query, options = {}) {
  // 3-tier classification: regex → keywords → LLM
}
```

### Query Router (`services/intent/queryRouter.js`)

Routes queries to appropriate retrieval strategies.

```javascript
export const queryRouter = {
  async route(query, options = {}) {
    const classification = await classifyIntent(query);
    const config = IntentCharacteristics[classification.intent];

    return {
      intent: classification.intent,
      confidence: classification.confidence,
      strategy: config.retrievalStrategy,
      config: { topK: config.topK, responsePrompt: config.responsePrompt },
      skipRAG: !config.requiresRetrieval,
    };
  },
};
```

### Retrieval Strategies (`services/intent/retrievalStrategies.js`)

Implements different retrieval strategies.

```javascript
export async function executeStrategy(strategy, query, retriever, vectorStore, config, options) {
  switch (strategy) {
    case 'focused':
      return executeFocusedStrategy(query, retriever, config, options);
    case 'multi-aspect':
      return executeMultiAspectStrategy(query, retriever, vectorStore, config, options);
    case 'deep':
      return executeDeepStrategy(query, retriever, vectorStore, config, options);
    case 'broad':
      return executeBroadStrategy(query, retriever, config, options);
    case 'context-only':
      return { documents: [], metrics: {} };
    case 'no-retrieval':
      return { documents: [], metrics: {} };
    default:
      return executeFocusedStrategy(query, retriever, config, options);
  }
}
```

## RAG Sub-Services

### Document Ranking (`services/rag/documentRanking.js`)

Reranks retrieved documents.

```javascript
export function rerankDocuments(docs, query, topK = 10) {
  // BM25 scoring
  // Cross-encoder reranking
  // RRF fusion
}

export function reciprocalRankFusion(rankedLists, k = 60) {
  // Combine multiple ranking lists
}
```

### LLM Judge (`services/rag/llmJudge.js`)

Evaluates answer quality.

```javascript
export async function evaluateAnswer(question, answer, sources, context) {
  // Returns:
  // - isGrounded: boolean
  // - hasHallucinations: boolean
  // - isRelevant: boolean
  // - confidence: number
  // - citedSourceNumbers: number[]
}
```

### Retrieval Enhancements (`services/rag/retrievalEnhancements.js`)

Context compression and chain initialization.

```javascript
export async function compressDocuments(docs, query, options = {}) {
  // LLM-based document compression
}

export async function initChains() {
  // Initialize compression chains
}
```

### Query Retrieval (`services/rag/queryRetrieval.js`)

Build Qdrant filters and retrieve documents.

```javascript
export function buildQdrantFilter(filters, workspaceId) {
  // Build filter with mandatory workspaceId
}

export async function retrieveAdditionalDocuments(queries, retriever, vectorStore, filter, existingDocs) {
  // Fetch more documents for retry
}
```

## Notion Services

### Notion OAuth (`services/notionOAuth.js`)

Handles Notion OAuth flow.

```javascript
export const notionOAuth = {
  getAuthorizationUrl(state) {
    // Generate OAuth URL
  },

  async exchangeCode(code) {
    // Exchange code for access token
  },

  async refreshToken(refreshToken) {
    // Refresh access token
  },
};
```

### Notion Transformer (`services/notionTransformer.js`)

Transforms Notion blocks to text/markdown.

```javascript
export const transformBlocksToText = (blocks, indentLevel = 0) => {
  // Convert Notion blocks to markdown
};

export const groupBlocksSemantically = (blocks) => {
  // Group blocks for semantic chunking
};

export const extractPageMetadata = (properties) => {
  // Extract metadata from Notion properties
};
```

## Memory Services

### Entity Memory (`services/memory/entityMemory.js`)

Manages conversation memory with entity extraction.

```javascript
export const entityMemory = {
  async buildMemoryContext(query, workspaceId, conversationId) {
    // Build context from entities and summaries
  },

  async extractEntities(text) {
    // Extract named entities from text
  },

  async storeEntities(conversationId, entities) {
    // Store extracted entities
  },
};
```

### Conversation Summarization (`services/memory/conversationSummarization.js`)

Summarizes long conversations.

```javascript
export async function summarizeConversation(messages, options = {}) {
  // Generate conversation summary
}

export async function shouldSummarize(conversationId) {
  // Check if conversation needs summarization
}
```

## Context Services

### Coreference Resolver (`services/context/coreferenceResolver.js`)

Resolves pronouns and references.

```javascript
export async function resolveReferences(query, history) {
  // Replace "it", "that", etc. with actual references
}
```

### Concept Hierarchy (`services/context/conceptHierarchy.js`)

Builds concept hierarchies from documents.

```javascript
export async function buildConceptHierarchy(documents) {
  // Extract and organize concepts
}
```

## Metrics Services

### Sync Metrics (`services/metrics/syncMetrics.js`)

Tracks sync operation metrics.

```javascript
export function initSyncMetrics(workspaceId, jobId) {
  // Initialize metrics tracking
}

export function recordDocumentProcessed(workspaceId, result) {
  // Record document processing result
}

export function completeSyncMetrics(workspaceId) {
  // Finalize and return metrics
}
```

## Security Services

### Tenant Isolation (`services/tenantIsolation.js`)

Manages multi-tenant context.

```javascript
export function withTenantContext(context, fn) {
  // Run function within tenant context
}

export function getCurrentTenant() {
  // Get current tenant from AsyncLocalStorage
}

export function tenantIsolationPlugin(schema) {
  // Mongoose plugin for auto-filtering
}
```

## Email & Notification Services

### Email Service (`services/emailService.js`)

Sends transactional emails via the **Resend HTTP API**.

```javascript
export const emailService = {
  sendEmail,                // Generic email sending
  sendWorkspaceInvitation,  // Workspace invite with branded template
  sendWelcomeEmail,         // New user onboarding
  sendPasswordResetEmail,   // Password reset link (1h expiry)
  sendEmailVerification,    // Email verification link (24h expiry)
  verifyConnection,         // Test Resend API connectivity
};
```

**Configuration:**

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | - | Resend API key (required for sending) |
| `SMTP_FROM_NAME` | `RAG Platform` | Display name in "From" field |
| `RESEND_FROM_EMAIL` | `noreply@retrieva.online` | Sender address (must match verified domain) |

:::note
If `RESEND_API_KEY` is not set, the service logs a warning and skips sending. This makes email optional for local development.
:::

### Notification Service (`services/notificationService.js`)

Dual-channel delivery: **WebSocket** (real-time) + **email** (important events).

```javascript
export const notificationService = {
  createAndDeliver,              // Create + deliver via best channel
  notifyWorkspaceInvitation,     // Invitation with WebSocket + email
  notifyPermissionChange,        // Role change notification
  notifyWorkspaceRemoval,        // Member removal notification
  notifySyncCompleted,           // Sync success summary
  notifySyncFailed,              // Sync failure (urgent, always emails)
  notifyWorkspaceMembers,        // Broadcast to all workspace members
};
```

**Delivery logic:**

1. Persist notification in MongoDB
2. If user is online, deliver via WebSocket (`socket.io`)
3. If user has email enabled for the notification type **and** priority is not LOW, send email
4. Urgent/high-priority notifications always attempt email delivery

User preferences are checked per notification type and channel (`inApp`, `email`, `push`).

## Service Dependencies

Services use dependency injection for testability:

```javascript
// Production
const ragService = new RAGService({
  llm: await getDefaultLLM(),
  vectorStoreFactory: getVectorStore,
  cache: ragCache,
  logger: winston,
});

// Testing
const testService = new RAGService({
  llm: mockLLM,
  vectorStoreFactory: () => mockVectorStore,
  cache: mockCache,
  logger: mockLogger,
});
```

## Error Handling

Services throw `AppError` for known errors:

```javascript
import { AppError } from '../utils/index.js';

if (!workspace) {
  throw new AppError('Workspace not found', 404);
}

if (!user.hasPermission('canQuery')) {
  throw new AppError('Permission denied', 403);
}
```

## MCP Data Source Service (`services/mcpDataSourceService.js`)

Orchestrates CRUD and sync operations for external data sources connected via the Model Context Protocol. See [Data Source Connectors](../architecture/data-source-connectors) for the full architecture.

### Key Functions

| Function | Description |
|----------|-------------|
| `registerMCPDataSource(workspaceId, data)` | Save a new MCP connection; probes the server before persisting |
| `listMCPDataSources(workspaceId)` | List all MCP sources for a workspace (auth token excluded) |
| `getMCPDataSource(workspaceId, id)` | Get a single source |
| `updateMCPDataSource(workspaceId, id, updates)` | Update settings; re-probes if URL or token changes |
| `deleteMCPDataSource(workspaceId, id)` | Remove source and soft-delete its indexed documents |
| `triggerMCPSync(workspaceId, id, syncType, triggeredBy)` | Enqueue a `mcpSync` BullMQ job |
| `testMCPConnection(serverUrl, authToken, sourceType)` | Test connectivity without persisting |
| `getMCPSourceStats(workspaceId, id)` | Return document counts by sync status |

### Registration Flow

```javascript
// Register a Confluence MCP server
const source = await registerMCPDataSource(workspaceId, {
  name:       'Confluence - Engineering',
  sourceType: 'confluence',
  serverUrl:  'https://mcp.company.internal/confluence',
  authToken:  'secret-bearer-token',
});
// Throws AppError(422) if the server is unreachable
```

### Triggering a Sync

```javascript
const { jobId } = await triggerMCPSync(workspaceId, source._id, 'incremental', 'manual');
// Enqueues to mcpSyncQueue → mcpSyncWorker → documentIndexQueue
```

## Logging Convention

All services log with a `service` identifier:

```javascript
logger.info('Processing query', {
  service: 'rag',
  queryLength: query.length,
  workspaceId,
});

logger.error('Query failed', {
  service: 'rag',
  error: error.message,
  stack: error.stack,
});
```
