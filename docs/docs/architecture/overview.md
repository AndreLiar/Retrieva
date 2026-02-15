---
sidebar_position: 1
---

# Architecture Overview

The RAG Platform follows a modular, layered architecture designed for scalability, security, and maintainability.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js Frontend                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│   │
│  │  │ Chat UI  │  │ Settings │  │Workspaces│  │ Analytics Dashboard││   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                         HTTPS / WebSocket (Socket.io)
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                          API Gateway Layer                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Express 5 Server                             │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │   │
│  │  │    Auth    │ │    Rate    │ │    CSRF    │ │   Workspace  │ │   │
│  │  │ Middleware │ │  Limiter   │ │ Protection │ │   Isolation  │ │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └──────────────┘ │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │   │
│  │  │   Abuse    │ │  Security  │ │  Webhook   │ │   Workspace  │ │   │
│  │  │ Detection  │ │ Sanitizer  │ │ Verify     │ │    Quota     │ │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └──────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │   RAG Service   │  │  Notion Sync    │  │      Auth Service       │ │
│  │                 │  │    Service      │  │                         │ │
│  │ - Intent        │  │ - OAuth         │  │ - JWT Management        │ │
│  │ - Retrieval     │  │ - Page Fetch    │  │ - Refresh Tokens        │ │
│  │ - Generation    │  │ - Transform     │  │ - Session Management    │ │
│  │ - Validation    │  │ - Token Monitor │  │ - Auth Audit Logging    │ │
│  │ - Guardrails    │  │ - Sync Cooldown │  │                         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ Analytics       │  │  Notification   │  │   Real-Time Services    │ │
│  │   Service       │  │    Service      │  │                         │ │
│  │                 │  │                 │  │ - Socket.io Service     │ │
│  │ - Query Metrics │  │ - Email (Resend)│  │ - Presence Tracking     │ │
│  │ - Cost Tracking │  │ - In-App Alerts │  │ - Live Analytics        │ │
│  │ - RAGAS Eval    │  │ - Token Expiry  │  │ - Activity Feed         │ │
│  │ - LangSmith     │  │                 │  │ - Real-Time Events      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ Memory Service  │  │ Security        │  │   Content Processing    │ │
│  │                 │  │   Services      │  │                         │ │
│  │ - Conversation  │  │                 │  │ - Notion Transformer    │ │
│  │   Context       │  │ - Tenant Iso.   │  │ - Semantic Chunking     │ │
│  │ - Memory Decay  │  │ - Security Log  │  │ - Answer Formatter      │ │
│  │ - Summaries     │  │ - Error Alerts  │  │ - Context Compression   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                        Worker Layer (BullMQ)                             │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐ │
│  │ Notion Sync       │ │ Document Index    │ │ Memory Decay          │ │
│  │   Worker          │ │   Worker          │ │   Worker              │ │
│  │                   │ │                   │ │                       │ │
│  │ - Full sync       │ │ - Chunk docs      │ │ - Prune old context   │ │
│  │ - Incremental     │ │ - Embeddings      │ │ - Summarize convos    │ │
│  │ - Rate limiting   │ │ - Qdrant storage  │ │ - Decay scores        │ │
│  │ - Error recovery  │ │ - Sparse vectors  │ │                       │ │
│  └───────────────────┘ └───────────────────┘ └───────────────────────┘ │
│  ┌───────────────────┐ ┌─────────────────────────────────────────────┐ │
│  │ Pipeline Worker   │ │            Dead Letter Queue                │ │
│  │                   │ │                                             │ │
│  │ - Batch processing│ │ - Failed job storage                       │ │
│  │ - Job chaining    │ │ - Retry management                         │ │
│  └───────────────────┘ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                       │
│  ┌───────────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │      MongoDB      │  │    Qdrant     │  │         Redis           │ │
│  │                   │  │               │  │                         │ │
│  │ - Users           │  │ - Dense Vecs  │  │ - Session Cache         │ │
│  │ - Workspaces      │  │ - Sparse Vecs │  │ - Rate Limit Counters   │ │
│  │ - Conversations   │  │ - Metadata    │  │ - BullMQ Job Queues     │ │
│  │ - Messages        │  │ - Filters     │  │ - RAG Response Cache    │ │
│  │ - DocumentSources │  │               │  │ - Sync Cooldown State   │ │
│  │ - SyncJobs        │  │               │  │                         │ │
│  │ - Analytics       │  │               │  │                         │ │
│  │ - AuditLogs       │  │               │  │                         │ │
│  │ - Notifications   │  │               │  │                         │ │
│  │ - TokenUsage      │  │               │  │                         │ │
│  │ - DeadLetterJobs  │  │               │  │                         │ │
│  └───────────────────┘  └───────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Services                                │
│  ┌───────────────┐  ┌──────────────────┐  ┌───────────────────────────┐│
│  │  Notion API   │  │   Azure OpenAI   │  │   Monitoring Services    ││
│  │               │  │                  │  │                          ││
│  │ - OAuth 2.0   │  │ - GPT-4o-mini    │  │ - LangSmith (LLM Tracing)││
│  │ - Pages API   │  │   (LLM)          │  │ - RAGAS (RAG Evaluation) ││
│  │ - Databases   │  │ - text-embedding │  │                          ││
│  │ - Search      │  │   -3-small       │  │                          ││
│  │ - Webhooks    │  │   (Embeddings)   │  │                          ││
│  └───────────────┘  └──────────────────┘  └───────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Request Flow

### RAG Query Flow

```
1. User submits question
         │
         ▼
2. Authentication & Authorization
   - JWT validation
   - Workspace membership check
   - Permission verification (canQuery)
         │
         ▼
3. Intent Classification (3-tier)
   - Regex patterns → Keyword scoring → LLM
   - Returns: intent type, confidence, strategy
         │
         ▼
4. Retrieval Strategy Selection
   - focused, multi-aspect, deep, broad, context-only, no-retrieval
         │
         ▼
5. Document Retrieval
   - Hybrid search (dense + sparse vectors)
   - Mandatory workspaceId filter
   - RRF (Reciprocal Rank Fusion) scoring
         │
         ▼
6. Post-Retrieval Processing
   - Cross-encoder reranking
   - LLM context compression
   - Quality filtering
         │
         ▼
7. Answer Generation
   - Structured prompt with context
   - Streaming via SSE
   - Citation enforcement
         │
         ▼
8. Answer Validation (LLM Judge)
   - Hallucination detection
   - Grounding verification
   - Citation validation
         │
         ▼
9. Response & Caching
   - Output sanitization
   - Confidence handling
   - Cache for repeated queries
```

### Notion Sync Flow

```
1. Sync Trigger (manual/scheduled)
         │
         ▼
2. Fetch Document List
   - Notion API pagination
   - Rate limit handling
         │
         ▼
3. Determine Changes
   - Content hash comparison
   - Full sync: all docs
   - Incremental: changed only
         │
         ▼
4. Queue Document Jobs
   - BullMQ job per document
   - Batch processing (30 docs)
         │
         ▼
5. Document Processing
   - Fetch page blocks
   - Transform to markdown
   - Semantic chunking
         │
         ▼
6. Indexing
   - Generate embeddings
   - Build sparse vectors
   - Store in Qdrant
         │
         ▼
7. Update Metadata
   - MongoDB document records
   - Workspace stats
   - Sync job status
```

## Directory Structure

```
rag/
├── backend/
│   ├── adapters/              # External service adapters
│   │   └── NotionAdapter.js   # Notion API client wrapper
│   ├── config/                # Configuration modules
│   │   ├── database.js        # MongoDB connection
│   │   ├── redis.js           # Redis connection
│   │   ├── queue.js           # BullMQ queue setup
│   │   ├── llm.js             # LLM provider factory
│   │   ├── llmProvider.js     # Azure OpenAI LLM config
│   │   ├── embeddings.js      # Embedding model factory
│   │   ├── embeddingProvider.js # Azure OpenAI embeddings
│   │   ├── vectorStore.js     # Qdrant configuration
│   │   ├── guardrails.js      # LLM guardrail settings
│   │   ├── langsmith.js       # LangSmith tracing
│   │   ├── swagger.js         # OpenAPI documentation
│   │   ├── logger.js          # Winston logger
│   │   └── envValidator.js    # Environment validation
│   ├── controllers/           # Request handlers (16 controllers)
│   │   ├── ragController.js
│   │   ├── authController.js
│   │   ├── conversationController.js
│   │   ├── notionController.js
│   │   ├── analyticsController.js
│   │   ├── memoryController.js
│   │   ├── evaluationController.js
│   │   └── ...
│   ├── middleware/            # Express middleware (11 modules)
│   │   ├── auth.js            # JWT authentication
│   │   ├── workspaceAuth.js   # Workspace authorization
│   │   ├── csrfProtection.js  # CSRF token validation
│   │   ├── abuseDetection.js  # Request abuse detection
│   │   ├── ragRateLimiter.js  # RAG-specific rate limits
│   │   ├── securitySanitizer.js # Input sanitization
│   │   ├── workspaceQuota.js  # Usage quota enforcement
│   │   └── ...
│   ├── models/                # Mongoose schemas (19 models)
│   │   ├── User.js
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   ├── NotionWorkspace.js
│   │   ├── DocumentSource.js
│   │   ├── SyncJob.js
│   │   ├── Analytics.js
│   │   ├── AuditLog.js
│   │   ├── TokenUsage.js
│   │   ├── Notification.js
│   │   ├── DeadLetterJob.js
│   │   └── ...
│   ├── routes/                # API route definitions (15 modules)
│   ├── services/              # Business logic
│   │   ├── rag.js             # Core RAG orchestration
│   │   ├── intentAwareRAG.js  # Intent-aware retrieval
│   │   ├── ragExecutor.js     # RAG execution engine
│   │   ├── intent/            # Intent classification (3-tier)
│   │   │   ├── intentClassifier.js
│   │   │   └── retrievalStrategies.js
│   │   ├── rag/               # RAG sub-modules
│   │   │   ├── documentRanking.js    # Cross-encoder reranking
│   │   │   ├── llmJudge.js           # Hallucination detection
│   │   │   ├── retrievalEnhancements.js
│   │   │   └── chunkFilter.js        # Quality filtering
│   │   ├── memory/            # Conversation memory
│   │   ├── context/           # Context management
│   │   ├── search/            # Search utilities
│   │   │   └── sparseVector.js # BM25 sparse vectors
│   │   ├── security/          # Security services
│   │   ├── pipeline/          # Processing pipelines
│   │   ├── versioning/        # Document versioning
│   │   ├── notionOAuth.js     # Notion OAuth flow
│   │   ├── notionTransformer.js # Notion → Markdown
│   │   ├── notionTokenMonitor.js # Token health checks
│   │   ├── socketService.js   # Socket.io real-time
│   │   ├── emailService.js    # Resend email sending
│   │   ├── notificationService.js
│   │   ├── deadLetterQueue.js # Failed job handling
│   │   ├── tenantIsolation.js # Multi-tenant security
│   │   ├── llmGuardrailService.js
│   │   ├── ragasEvaluation.js # RAGAS integration
│   │   └── ...
│   ├── workers/               # BullMQ background workers
│   │   ├── notionSyncWorker.js     # Notion sync jobs
│   │   ├── documentIndexWorker.js  # Embedding/indexing
│   │   ├── memoryDecayWorker.js    # Memory cleanup
│   │   ├── pipelineWorker.js       # Pipeline processing
│   │   └── index.js                # Worker initialization
│   ├── loaders/               # Document loaders
│   │   └── notionDocumentLoader.js
│   ├── prompts/               # LLM prompt templates
│   │   └── ragPrompt.js
│   ├── repositories/          # Data access layer
│   ├── utils/                 # Utility functions
│   │   ├── core/              # Core utilities
│   │   ├── rag/               # RAG-specific utils
│   │   └── security/          # Security utils (JWT, crypto)
│   ├── validators/            # Request validation schemas
│   ├── scripts/               # Maintenance scripts
│   └── tests/                 # Test suites
│       ├── unittest/
│       └── integrationtest/
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js 15 App Router
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities & state
│   │   │   ├── api/           # API client (Axios)
│   │   │   ├── stores/        # Zustand state stores
│   │   │   └── hooks/         # Custom React hooks
│   │   └── types/             # TypeScript definitions
│   └── public/                # Static assets
├── ragas-service/             # Python RAGAS evaluation service
├── infra/                     # Terraform infrastructure
├── docs/                      # Docusaurus documentation
├── docker-compose.yml         # Development environment
├── docker-compose.staging.yml # Staging environment
└── package.json               # Root package (workspaces)
```

## LangChain Orchestration

The platform uses **LangChain** as the core AI orchestration framework, providing a unified interface for LLMs, embeddings, vector stores, and chains.

### LangChain Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LangChain Orchestration Layer                     │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    @langchain/core                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│   │
│  │  │ChatPrompt    │  │StringOutput  │  │ HumanMessage/          ││   │
│  │  │  Template    │  │   Parser     │  │ AIMessage              ││   │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘│   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│   │
│  │  │Messages      │  │LangChain     │  │ Runnable               ││   │
│  │  │  Placeholder │  │  Tracer      │  │ Sequences              ││   │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │ @langchain/     │  │ @langchain/     │  │ @langchain/           │  │
│  │    openai       │  │    qdrant       │  │    textsplitters      │  │
│  │                 │  │                 │  │                       │  │
│  │ AzureChatOpenAI │  │ QdrantVector    │  │ RecursiveCharacter    │  │
│  │ AzureOpenAI     │  │   Store         │  │   TextSplitter        │  │
│  │   Embeddings    │  │                 │  │                       │  │
│  └─────────────────┘  └─────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### LangChain Components Used

| Package | Component | Purpose |
|---------|-----------|---------|
| `@langchain/openai` | `AzureChatOpenAI` | LLM for chat completions |
| `@langchain/openai` | `AzureOpenAIEmbeddings` | Text embeddings (1536 dims) |
| `@langchain/qdrant` | `QdrantVectorStore` | Vector similarity search |
| `@langchain/core` | `ChatPromptTemplate` | Structured prompt templates |
| `@langchain/core` | `MessagesPlaceholder` | Conversation history injection |
| `@langchain/core` | `StringOutputParser` | Parse LLM string responses |
| `@langchain/core` | `HumanMessage/AIMessage` | Chat message types |
| `@langchain/core` | `LangChainTracer` | LangSmith integration |
| `@langchain/textsplitters` | `RecursiveCharacterTextSplitter` | Document chunking |
| `@langchain/community` | `PDFLoader` | PDF document loading |

### Chain Patterns

The RAG pipeline uses LangChain's LCEL (LangChain Expression Language) for composable chains:

```javascript
// Example: RAG Chain with history
const chain = ChatPromptTemplate.fromMessages([
  ["system", systemPrompt],
  new MessagesPlaceholder("chat_history"),
  ["human", "{question}"],
])
  .pipe(llm)
  .pipe(new StringOutputParser());

// Streaming execution
const stream = await chain.stream({
  question: userQuery,
  chat_history: messages,
  context: retrievedDocs,
});
```

### Where LangChain is Used

| Service | LangChain Usage |
|---------|-----------------|
| `services/rag.js` | Main RAG chain with prompts, history, streaming |
| `services/intentAwareRAG.js` | Intent-based chain selection |
| `services/intent/intentClassifier.js` | LLM-based intent classification |
| `services/rag/llmJudge.js` | Hallucination detection chain |
| `services/rag/crossEncoderRerank.js` | LLM-based reranking |
| `services/rag/retrievalEnhancements.js` | Query expansion, HyDE |
| `services/answerFormatter.js` | Answer formatting chain |
| `services/memory/summarization.js` | Conversation summarization |
| `services/memory/entityExtraction.js` | Named entity extraction |
| `services/context/coreferenceResolver.js` | Pronoun resolution |
| `config/vectorStore.js` | Qdrant vector store setup |
| `config/embeddings.js` | Azure embedding model |
| `config/llmProvider.js` | LLM provider factory |
| `loaders/notionDocumentLoader.js` | Document splitting |

### LLM Provider Configuration

```javascript
// config/llmProvider.js - Factory pattern for LLM providers
export async function createLLM(options = {}) {
  const provider = process.env.LLM_PROVIDER || 'azure_openai';

  switch (provider) {
    case 'azure_openai':
      const { AzureChatOpenAI } = await import('@langchain/openai');
      return new AzureChatOpenAI({
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiInstanceName: instanceName,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
        temperature: options.temperature ?? 0.3,
        streaming: options.streaming ?? true,
      });
    // ... other providers
  }
}
```

## Key Design Decisions

### 1. Hybrid Search

Combines dense (semantic) and sparse (BM25) vectors for better retrieval:

- **Dense vectors**: Capture semantic meaning (text-embedding-3-small)
- **Sparse vectors**: Capture exact term matching
- **RRF fusion**: Combines rankings from both methods

### 2. Semantic Chunking

Documents are chunked based on structure, not character count:

- Headings create new chunks
- Lists, tables, code blocks stay together
- Heading paths preserved for context
- Target size: 200-400 tokens

### 3. Intent-Aware Retrieval

Different query types need different retrieval strategies:

| Intent | Strategy | Top-K | Description |
|--------|----------|-------|-------------|
| Factual | focused | 5 | Single-source precision |
| Comparison | multi-aspect | 10 | Multiple viewpoints |
| Explanation | deep | 8 | Comprehensive coverage |
| Aggregation | broad | 15 | Wide coverage |
| Procedural | focused | 6 | Step-by-step |

### 4. Multi-Tenant Isolation

Three-layer protection for data isolation:

1. **Middleware**: Workspace membership verification
2. **Database**: Mongoose plugin auto-filters by workspaceId
3. **Vector Store**: Mandatory workspaceId in all Qdrant queries

### 5. LLM Guardrails

Multiple safeguards against LLM misbehavior:

- **Prompt injection prevention**: XML-delimited user input
- **Hallucination detection**: LLM Judge evaluation
- **Output sanitization**: XSS/injection prevention
- **Confidence blocking**: Low-confidence answer filtering

## Data Models

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | User accounts | email, passwordHash, role, workspaces |
| **NotionWorkspace** | Connected Notion workspaces | workspaceId, accessToken (encrypted), ownerId |
| **WorkspaceMember** | Workspace membership & roles | userId, workspaceId, role (owner/admin/member/viewer) |
| **Conversation** | Chat conversations | userId, workspaceId, title, messages |
| **Message** | Individual messages | conversationId, role, content, sources |

### Document Management

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **DocumentSource** | Indexed Notion pages | sourceId, workspaceId, title, contentHash, chunkCount |
| **SyncJob** | Sync operation tracking | workspaceId, status, type, progress, error |
| **DocumentSummary** | AI-generated summaries | sourceId, summary, topics, entities |
| **DocumentVersion** | Document change history | sourceId, version, changes, timestamp |

### Analytics & Monitoring

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Analytics** | RAG query metrics | questionHash, latency, confidence, sources |
| **TokenUsage** | LLM token consumption | userId, date, inputTokens, outputTokens, cost |
| **AuditLog** | System activity log | action, userId, resource, details, ip |
| **AuthAuditLog** | Auth-specific events | event, email, success, ip, userAgent |
| **QueryActivity** | Search analytics | query, intent, retrievedDocs, feedback |

### System Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Notification** | In-app notifications | userId, type, title, read, data |
| **DeadLetterJob** | Failed job storage | originalJob, error, attempts, lastAttempt |
| **ConversationSummary** | Compressed conversation context | conversationId, summary, keyPoints |
| **Entity** | Extracted entities from docs | name, type, mentions, workspaceId |

## API Endpoints

### Authentication (`/api/v1/auth`)
- `POST /register` - User registration
- `POST /login` - User login (returns JWT)
- `POST /refresh` - Refresh access token
- `POST /logout` - Invalidate tokens
- `GET /me` - Current user info

### RAG (`/api/v1/rag`)
- `POST /` - Ask a question (non-streaming)
- `POST /stream` - Ask with SSE streaming
- `GET /cache/stats` - Cache statistics

### Conversations (`/api/v1/conversations`)
- `GET /` - List conversations
- `POST /` - Create conversation
- `GET /:id` - Get conversation with messages
- `DELETE /:id` - Delete conversation
- `POST /:id/ask` - Ask within conversation context

### Notion (`/api/v1/notion`)
- `GET /auth` - Initiate OAuth flow
- `GET /callback` - OAuth callback
- `GET /workspaces` - List connected workspaces
- `POST /workspaces/:id/sync` - Trigger sync
- `GET /workspaces/:id/sync-status` - Sync progress
- `DELETE /workspaces/:id` - Disconnect workspace

### Analytics (`/api/v1/analytics`)
- `GET /dashboard` - Dashboard metrics
- `GET /queries` - Query history
- `GET /usage` - Token usage stats
- `POST /:id/feedback` - Submit feedback

### Memory (`/api/v1/memory`)
- `GET /conversations/:id/context` - Get conversation context
- `POST /conversations/:id/summarize` - Summarize conversation
- `DELETE /conversations/:id/context` - Clear context

### Health & Monitoring
- `GET /health` - Service health check
- `GET /api-docs` - Swagger UI

## Real-Time Features

The platform uses **Socket.io** for real-time communication:

### Events (Server → Client)
| Event | Description |
|-------|-------------|
| `sync:progress` | Sync job progress updates |
| `sync:complete` | Sync job completed |
| `sync:error` | Sync job failed |
| `notification` | New notification |
| `presence:update` | User presence changes |
| `analytics:live` | Live analytics updates |

### Events (Client → Server)
| Event | Description |
|-------|-------------|
| `join:workspace` | Join workspace room |
| `leave:workspace` | Leave workspace room |
| `presence:ping` | Heartbeat for presence |

## Monitoring & Evaluation

### LangSmith Integration
- Traces all LLM calls (chat completions, embeddings)
- Captures latency, token usage, and errors
- Links traces to conversations for debugging

### RAGAS Evaluation Service
Separate Python service (`ragas-service/`) for RAG quality evaluation:

| Metric | Description |
|--------|-------------|
| **Faithfulness** | Answer grounded in retrieved context |
| **Relevancy** | Answer addresses the question |
| **Context Precision** | Retrieved docs are relevant |
| **Context Recall** | All needed info was retrieved |

### Cost Tracking
- Per-user token usage tracking
- Daily/weekly/monthly aggregation
- Cost alerting thresholds
- LLM model cost attribution

## Environment-Specific Configurations

| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| **MongoDB** | Docker local | Atlas M0/M2 | Atlas M10+ |
| **Redis** | Docker local | Docker/Managed | Self-hosted Docker (same droplet) |
| **Qdrant** | Docker local | Qdrant Cloud Free | Self-hosted Docker (same droplet) |
| **LLM** | Azure OpenAI | Azure OpenAI | Azure OpenAI |
| **Logging** | Debug level | Debug level | Info level |
| **Rate Limits** | Relaxed | Moderate | Strict |
| **CSRF** | Disabled | Enabled | Enabled |
