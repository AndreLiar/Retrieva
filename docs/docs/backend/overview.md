---
sidebar_position: 1
---

# Backend Overview

The backend is built with Express 5 and follows a modular architecture with clear separation of concerns.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Express 5 |
| Runtime | Node.js 20+ |
| AI Orchestration | LangChain (@langchain/core, @langchain/openai, @langchain/qdrant) |
| LLM | Azure OpenAI (GPT-4o-mini) via LangChain |
| Embeddings | Azure OpenAI (text-embedding-3-small) via LangChain |
| Vector Store | Qdrant (via @langchain/qdrant) |
| Database | MongoDB (Mongoose ODM) |
| Cache | Redis |
| Queue | BullMQ |
| Real-Time | Socket.io |
| Monitoring | LangSmith (LLM tracing), RAGAS (evaluation) |

## Directory Structure

```
backend/
├── adapters/           # External service adapters
│   └── NotionAdapter.js
├── config/             # Configuration modules
│   ├── database.js     # MongoDB connection
│   ├── redis.js        # Redis connection
│   ├── queue.js        # BullMQ queues
│   ├── llm.js          # LLM provider
│   ├── embeddings.js   # Embedding model
│   ├── vectorStore.js  # Qdrant setup
│   ├── logger.js       # Winston logger
│   └── guardrails.js   # LLM guardrails config
├── controllers/        # Request handlers
│   ├── ragController.js
│   ├── authController.js
│   ├── conversationController.js
│   ├── notionController.js
│   └── analyticsController.js
├── middleware/         # Express middleware
│   ├── auth.js
│   ├── loadWorkspace.js
│   ├── workspaceAuth.js
│   ├── rateLimiter.js
│   ├── validate.js
│   └── errorHandler.js
├── models/             # Mongoose schemas
│   ├── User.js
│   ├── Conversation.js
│   ├── Message.js
│   ├── NotionWorkspace.js
│   ├── DocumentSource.js
│   ├── SyncJob.js
│   └── Analytics.js
├── routes/             # API routes
│   ├── ragRoutes.js
│   ├── authRoutes.js
│   ├── conversationRoutes.js
│   ├── notionRoutes.js
│   └── analyticsRoutes.js
├── services/           # Business logic
│   ├── rag.js          # Core RAG service
│   ├── intent/         # Intent classification
│   ├── rag/            # RAG sub-modules
│   ├── memory/         # Conversation memory
│   ├── context/        # Context management
│   └── metrics/        # Observability
├── utils/              # Utilities
│   ├── core/           # Core utilities
│   ├── rag/            # RAG utilities
│   └── security/       # Security utilities
├── workers/            # Background workers
│   ├── notionSyncWorker.js
│   └── documentIndexWorker.js
├── loaders/            # Document loaders
│   └── notionDocumentLoader.js
├── prompts/            # LLM prompts
│   └── ragPrompt.js
├── validators/         # Request validators
│   └── schemas.js
├── app.js              # Express app setup
└── index.js            # Entry point
```

## Entry Points

### index.js

Server initialization:

```javascript
// index.js

import { connectDB } from './config/database.js';
import { createServer } from './app.js';
import { initializeWorkers } from './workers/index.js';
import { ragService } from './services/rag.js';

async function startServer() {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Initialize background workers
  await initializeWorkers();

  // 3. Pre-warm RAG system
  await ragService.init();

  // 4. Start Express server
  const app = await createServer();
  const server = app.listen(process.env.PORT || 3007);

  // Graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown(server));
}

startServer();
```

### app.js

Express configuration:

```javascript
// app.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

export async function createServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors(corsOptions));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Rate limiting
  app.use(rateLimiter);

  // Routes
  app.use('/api/v1/rag', ragRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/notion', notionRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);

  // Health check
  app.get('/health', healthCheck);

  // Swagger docs
  app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec));

  // Error handling
  app.use(errorHandler);

  return app;
}
```

## Request Flow

```
Request
    │
    ▼
┌─────────────────┐
│ Security        │ ◀─── helmet, cors, rate limiting
│ Middleware      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Body Parsing    │ ◀─── JSON, cookies
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authentication  │ ◀─── JWT validation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authorization   │ ◀─── Workspace access, permissions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validation      │ ◀─── Request body validation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Controller      │ ◀─── Request handling
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Service         │ ◀─── Business logic
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Response        │ ◀─── Formatted response
└─────────────────┘
```

## Code Conventions

### ES6 Modules

```javascript
// Use ES6 imports
import express from 'express';
import { ragService } from './services/rag.js';

// Named exports preferred
export const myFunction = () => {};
export default class MyClass {}
```

### Async/Await

```javascript
// Always use async/await
export const getUser = async (id) => {
  const user = await User.findById(id);
  return user;
};

// Use catchAsync wrapper for controllers
export const createUser = catchAsync(async (req, res) => {
  const user = await User.create(req.body);
  sendSuccess(res, { user }, 201);
});
```

### Error Handling

```javascript
import { AppError } from '../utils/index.js';

// Throw AppError for known errors
if (!user) {
  throw new AppError('User not found', 404);
}

// Error handler middleware catches all
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});
```

### Response Formatting

```javascript
import { sendSuccess, sendError } from '../utils/index.js';

// Success response
sendSuccess(res, { user: userData }, 200, 'User created');

// Error response (use AppError instead)
throw new AppError('Validation failed', 400);
```

### Logging

```javascript
import logger from '../config/logger.js';

logger.info('Operation completed', {
  service: 'rag',
  userId: req.user._id,
  duration: Date.now() - startTime,
});

logger.error('Operation failed', {
  service: 'rag',
  error: error.message,
  stack: error.stack,
});
```

## Configuration

### Environment Variables

```bash
# Server
PORT=3007
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rag

# Redis
REDIS_HOST=localhost
REDIS_PORT=6378

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=notion_documents

# Azure OpenAI
LLM_PROVIDER=azure_openai
EMBEDDING_PROVIDER=azure
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

# JWT
JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Notion
NOTION_CLIENT_ID=your-client-id
NOTION_CLIENT_SECRET=your-client-secret
```

### File Size Limit

Keep files under 500 lines. If exceeded, extract functionality into separate modules.

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

## Common Commands

```bash
# Development
npm run dev

# Production
npm start

# Workers only
npm run workers

# Qdrant utilities
npm run qdrant:list
npm run qdrant:info
npm run qdrant:collections
```
