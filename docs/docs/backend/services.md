---
sidebar_position: 2
---

# Services

Services contain the core business logic of the application. They are called by controllers and interact with models, external APIs, and other services.

## Core Services

### RAG Service (`services/rag.js`)

The main RAG orchestration service. Handles query pre-processing, safety checks, caching, and answer generation. Delegates **document retrieval** entirely to the RAG Agent (see below).

```javascript
class RAGService {
  async askWithConversation(question, options) {
    // 1. Safety & guardrail checks (PII, hallucination blocklist)
    // 2. Check Redis cache (question × workspaceId)
    // 3. Rephrase query for standalone search
    // 4. Run RAG Agent → collect documents
    // 5. Rerank documents (RRF + BM25, top-15)
    // 6. Compress context → generate streaming answer
    // 7. Validate answer (LLM Judge)
    // 8. Cache + persist to MongoDB
  }
}
```

**Key Methods:**

| Method | Description |
|--------|-------------|
| `init()` | Initialize LLM, vector store, and chains |
| `askWithConversation()` | Process RAG query with conversation context |
| `_rephraseQuery()` | Rephrase query for standalone search |
| `_prepareContext()` | Format documents for LLM context |
| `_generateAnswer()` | Generate streaming answer via Azure OpenAI |
| `_processAnswer()` | Validate answer with LLM Judge |

### RAG Agent (`services/ragAgent.js`)

LangGraph ReAct agent that autonomously retrieves context across multiple sources. Called by `rag.js` instead of the old fixed retrieval strategies.

```javascript
export async function runRetrievalAgent({ question, vectorStore, workspaceId, qdrantFilter, history, emit, llm }) {
  // Builds 4 tools, runs createReactAgent loop (max 30 steps)
  // Returns: { documents: LangChain Document[] }
}
```

**Agent Tools:**

| Tool | Source | Max results |
|------|--------|-------------|
| `search_knowledge_base` | `langchain-rag` Qdrant collection (tenant-filtered) | k ≤ 15 per call |
| `search_dora_articles` | `compliance_kb` Qdrant collection; optional domain filter | 8 per call |
| `lookup_vendor_assessment` | MongoDB `assessments` collection (regex vendor match) | 1 record |
| `done_searching` | — signals retrieval complete | — |

Documents from all tool calls are deduplicated (by first 200 chars of content) and returned as a flat array for reranking.

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

Legacy fixed retrieval strategies (focused, multi-aspect, deep, broad). These are no longer called from the main RAG pipeline — retrieval is now handled by the RAG Agent. The strategies remain available for testing and fallback scenarios.

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

## Object Storage (`config/storage.js`)

Provides persistent file storage using **DigitalOcean Spaces** (S3-compatible). All objects are stored under an org-scoped key prefix to enforce multi-tenant isolation. The module degrades gracefully when Spaces env vars are absent — uploads are skipped and download endpoints return 404.

```javascript
// Key builders
buildDataSourceKey(orgId, workspaceId, dataSourceId, fileName)
// → organizations/{orgId}/workspaces/{wsId}/datasources/{dsId}/{fileName}

buildAssessmentFileKey(orgId, workspaceId, assessmentId, docIndex, fileName)
// → organizations/{orgId}/workspaces/{wsId}/assessments/{assessmentId}/{index}_{fileName}
```

| Export | Description |
|--------|-------------|
| `isStorageConfigured()` | Returns `true` when all four `DO_SPACES_*` env vars are set |
| `uploadFile(key, buffer, mimeType)` | Uploads a buffer to Spaces, returns the key |
| `downloadFileStream(key)` | Returns a readable stream — pipe directly to Express `res` |
| `deleteFile(key)` | Deletes an object; no-op when storage is not configured |

**Configuration env vars:** `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION` (default: `fra1`).

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

Sends transactional emails via the **Resend HTTP API**. In **microservice mode** (`EMAIL_SERVICE_URL` is set), this file proxies HTTP calls to the standalone `email-service` (port 3008). When the env var is unset, it calls the Resend HTTP API directly in-process.

```javascript
export const emailService = {
  sendEmail,                   // Generic email sending
  sendWorkspaceInvitation,     // Workspace invite with branded template
  sendWelcomeEmail,            // New user onboarding
  sendPasswordResetEmail,      // Password reset link (1h expiry)
  sendEmailVerification,       // Email verification link (24h expiry)
  sendQuestionnaireInvitation, // Vendor questionnaire link with deadline
  sendMonitoringAlert,         // Compliance alert emails to workspace owners
  sendOrganizationInvitation,  // Team invite email with /join?token=XXX link (7-day expiry)
  verifyConnection,            // Test Resend API connectivity
};
```

**Configuration:**

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | - | Resend API key (required for sending) |
| `SMTP_FROM_NAME` | `RAG Platform` | Display name in "From" field |
| `RESEND_FROM_EMAIL` | `noreply@retrieva.online` | Sender address (must match verified domain) |
| `EMAIL_SERVICE_URL` | - | When set, proxy to standalone email-service instead of calling Resend directly |

:::note
If `RESEND_API_KEY` is not set, the service logs a warning and skips sending. This makes email optional for local development.
:::

### Notification Service (`services/notificationService.js`)

Dual-channel delivery: **WebSocket** (real-time) + **email** (important events).

In **microservice mode** (`NOTIFICATION_SERVICE_URL` is set), this file is a thin HTTP proxy to the standalone `notification-service` (port 3009) which owns the Notification MongoDB collection and Redis pub/sub publishing. When unset, in-process logic is used (no docker-compose required for local dev).

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

**Delivery logic (both modes):**

1. Persist notification in MongoDB
2. If user is online, deliver via WebSocket (in-process emit or Redis pub/sub publish)
3. If user has email enabled for the notification type **and** priority is not LOW, send email
4. Urgent/high-priority notifications always attempt email delivery

User preferences are checked per notification type and channel (`inApp`, `email`, `push`).

### Real-Time / Presence Service

Socket.io real-time communication and user presence tracking. Like email and notifications, this follows the **strangler fig** pattern.

**`services/socketService.js`** — When `REALTIME_SERVICE_URL` is set, the monolith publishes events to Redis channels instead of maintaining a Socket.io server. When unset, the full Socket.io server runs in-process (same as before the extraction).

**`services/presenceService.js`** — When `REALTIME_SERVICE_URL` is set, all write operations are no-ops (the `realtime-service` owns presence state) and reads query Redis hashes directly. When unset, an in-memory Map is used.

| Function | Remote mode | Local mode |
|----------|-------------|------------|
| `emitToUser()` | Publishes to `realtime:user:{userId}` Redis channel | Emits directly via Socket.io |
| `emitToWorkspace()` | Publishes to `realtime:workspace:{id}` Redis channel | Emits to Socket.io room |
| `isUserOnline()` | Reads `presence:user:{userId}` Redis HASH (async) | Checks in-memory Map (sync) |
| `userConnected()` | no-op | Updates in-memory Map |
| `getWorkspacePresence()` | Reads `presence:workspace:{id}:members` Redis HASH | Reads in-memory Map |

**Analytics socket events** (`analytics:subscribe`, `analytics:get`) are no-ops in the standalone `realtime-service` — the `liveAnalyticsService` remains in the monolith and is only available in local mode.

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

---

## Assessment Services

### File Ingestion Service (`services/fileIngestionService.js`)

Parses vendor documents and indexes them into per-assessment Qdrant collections.

**Key functions**

| Function | Description |
|----------|-------------|
| `parseFile(buffer, mimetype)` | Dispatches to pdf-parse / xlsx / mammoth depending on file type |
| `chunkText(text)` | Splits into 600-char overlapping chunks at paragraph/sentence boundaries |
| `ingestFile(assessmentId, file)` | Parse → chunk → embed → upsert to `assessment_{id}` Qdrant collection |
| `searchAssessmentChunks(assessmentId, query, k)` | Semantic search within an assessment's collection |
| `deleteAssessmentCollection(assessmentId)` | Removes the `assessment_{id}` collection from Qdrant on deletion |

### Gap Analysis Agent (`services/gapAnalysisAgent.js`)

Three-step ReAct agent that produces structured compliance gap output.

**Steps**

1. **Extract vendor claims** — runs 8 domain-focused semantic queries against `assessment_{id}` to surface what the vendor documents actually claim
2. **Retrieve DORA obligations** — queries the shared `compliance_kb` collection per DORA domain with metadata filtering
3. **Diff & score** — passes both sets to Azure OpenAI with `bindTools()` (function calling) using the `GAP_ANALYSIS_TOOL` schema; falls back to JSON mode if tool calling fails

**Output schema**

```javascript
{
  gaps: [{ article, domain, requirement, vendorCoverage, gapLevel, recommendation, sourceChunks }],
  overallRisk: 'High' | 'Medium' | 'Low',
  summary: string,
  domainsAnalyzed: string[]
}
```

### Alert Monitor Service (`services/alertMonitorService.js`)

Runs compliance threshold checks across all workspaces and delivers email alerts to workspace owners.

**Entry point:** `runMonitoringAlerts()` — called by `monitoringWorker.js` on the 24-hour schedule.

```javascript
export async function runMonitoringAlerts() {
  // Runs 4 checks in parallel via Promise.allSettled():
  //   checkCertificationExpiry()  — 90/30/7 day windows
  //   checkContractRenewal()      — 60 days before contractEnd
  //   checkAnnualReviewOverdue()  — nextReviewDate in the past
  //   checkAssessmentOverdue()    — no complete assessment in 12 months
}
```

**Deduplication:** Before sending, each check reads `workspace.alertsSentAt.get(alertKey)`. If the timestamp is within the last 20 hours the alert is skipped. After sending, `workspace.alertsSentAt` is updated via `Workspace.updateOne` (no full document save).

**Alert keys** stored in `Workspace.alertsSentAt`:

| Key pattern | Trigger |
|-------------|---------|
| `cert-expiry-90-<certType>` | Cert expires within 90 days |
| `cert-expiry-30-<certType>` | Cert expires within 30 days |
| `cert-expiry-7-<certType>` | Cert expires within 7 days |
| `contract-renewal-60` | `contractEnd` within 60 days |
| `annual-review-overdue` | `nextReviewDate` < now |
| `assessment-overdue-12mo` | No complete assessment in 12 months |

### RoI Export Service (`services/roiExportService.js`)

Generates an EBA-compliant DORA Article 28(3) Register of Information as an XLSX workbook.

**Entry point:** `generateRoiWorkbook(userId)` — called by `exportController.js`.

```javascript
export async function generateRoiWorkbook(userId) {
  // 1. Fetch all workspaces the user has access to (via WorkspaceMember)
  // 2. Aggregate latest complete assessment per workspace
  // 3. Aggregate latest complete questionnaire per workspace
  // 4. Build 4-sheet XLSX workbook and return as Buffer
}
```

**Sheets produced:**

| Sheet | EBA reference | Content |
|-------|---------------|---------|
| RT.01.01 Summary | — | Institution name, report date, vendor counts by tier |
| RT.02.01 ICT Providers | DORA Art. 28(3) | One row per vendor: country, service type, contract dates, criticality, scores |
| RT.03.01 Certifications | — | One row per certification per vendor |
| RT.04.01 Gap Summary | — | One row per gap from latest complete assessment |

Uses the `xlsx` npm package (`XLSX.utils.aoa_to_sheet`, `XLSX.write`). The institution name is read from `process.env.INSTITUTION_NAME` (default: `'Financial Entity'`).

### Report Generator (`services/reportGenerator.js`)

Generates a Word (.docx) compliance report using the `docx` npm package.

**Sections**
1. Cover page with vendor name, framework, and date
2. Executive summary with risk stats table
3. Full gap analysis table (article, domain, gap level, recommendation)
4. Domain-by-domain breakdown
5. Methodology notes

Entry point: `generateReport(assessmentId)` → returns a `Buffer` ready to stream.
