---
sidebar_position: 6
---

# Configuration

Configuration modules manage connections to external services and application settings.

## Database Configuration

### MongoDB (`config/database.js`)

```javascript
import mongoose from 'mongoose';
import logger from './logger.js';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
}
```

### Redis (`config/redis.js`)

```javascript
import { Redis } from 'ioredis';
import logger from './logger.js';

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6378,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

// For BullMQ (needs IORedis instance)
export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6378,
};
```

## LLM Configuration

### LLM Provider (`config/llm.js`)

```javascript
import { AzureChatOpenAI } from '@langchain/openai';
import logger from './logger.js';

let defaultLLM = null;
let judgeLLM = null;

export async function getDefaultLLM() {
  if (defaultLLM) return defaultLLM;

  defaultLLM = new AzureChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: extractInstanceName(process.env.AZURE_OPENAI_ENDPOINT),
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_LLM_DEPLOYMENT || 'gpt-4o-mini',
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.3,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 2000,
  });

  // Warm up the model
  try {
    await defaultLLM.invoke('Hello');
    logger.info('LLM initialized and warmed up', {
      deployment: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
    });
  } catch (error) {
    logger.warn('LLM warmup failed:', error.message);
  }

  return defaultLLM;
}

export async function getJudgeLLM() {
  if (judgeLLM) return judgeLLM;

  judgeLLM = new AzureChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: extractInstanceName(process.env.AZURE_OPENAI_ENDPOINT),
    azureOpenAIApiDeploymentName: process.env.JUDGE_LLM_MODEL || 'gpt-4o-mini',
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
    temperature: 0,  // Deterministic for evaluation
  });

  return judgeLLM;
}
```

### Embeddings (`config/embeddings.js`)

The embeddings module wraps `AzureOpenAIEmbeddings` from `@langchain/openai` inside a custom `BatchedEmbeddings` class that adds automatic batching, text truncation, and metrics tracking.

**Provider:** Azure OpenAI — `text-embedding-3-small` (1 536-dimension vectors, Cosine distance).
Hybrid mode (`ENABLE_HYBRID_EMBEDDINGS`) is disabled; Azure is the only active provider.

```javascript
// Simplified structure — actual class has ~350 lines
import { AzureOpenAIEmbeddings } from '@langchain/openai';

const baseEmbeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiInstanceName: AZURE_OPENAI_INSTANCE_NAME, // extracted from AZURE_OPENAI_ENDPOINT
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small',
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
  maxConcurrency: parseInt(process.env.EMBEDDING_MAX_CONCURRENCY) || 10,
});

export const embeddings = new BatchedEmbeddings(baseEmbeddings, BATCH_CONFIG);
```

#### Batch Configuration

```javascript
export const BATCH_CONFIG = {
  maxChunks: parseInt(process.env.EMBEDDING_BATCH_MAX_CHUNKS) || 50,  // max chunks per API call
  maxTokens: parseInt(process.env.EMBEDDING_BATCH_MAX_TOKENS) || 8192, // max tokens per batch
  charsPerToken: 4,                                                     // estimation ratio
};
```

Batches are split whenever either limit (`maxChunks` or `maxTokens`) would be exceeded. Each batch is sent as a single `embedDocuments()` call.

#### Truncation & Retry

Texts exceeding `maxCharsPerChunk` are truncated before embedding. If the API still returns a context-length error, the system retries with progressively shorter inputs:

| Attempt | Text length |
|---------|------------|
| 1 | Full (truncated to `maxCharsPerChunk`) |
| 2 | 50% of original |
| 3 | 25% of original |
| 4 | 10% of original (minimum 100 chars) |

#### Metrics

```javascript
import { getEmbeddingMetrics } from './config/embeddings.js';

const m = getEmbeddingMetrics();
// { totalChunksEmbedded, totalBatches, chunksPerSecond, avgBatchLatencyMs, errors, truncations }
```

## Vector Store Configuration

### Qdrant (`config/vectorStore.js`)

```javascript
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from '@langchain/qdrant';
import { getEmbeddings } from './embeddings.js';

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

export async function getVectorStore(documents = []) {
  const embeddings = await getEmbeddings();
  const collectionName = process.env.QDRANT_COLLECTION_NAME || 'documents';

  // Ensure collection exists
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some(c => c.name === collectionName);

  if (!exists) {
    await qdrantClient.createCollection(collectionName, {
      vectors: {
        size: 1536,  // text-embedding-3-small dimension
        distance: 'Cosine',
      },
    });
  }

  return new QdrantVectorStore(embeddings, {
    client: qdrantClient,
    collectionName,
  });
}

export { qdrantClient };
```

## Queue Configuration

### BullMQ Queues (`config/queue.js`)

```javascript
import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

export const assessmentQueue = new Queue('assessmentJobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 50, age: 7 * 24 * 60 * 60 },
    removeOnFail: { count: 100 },
  },
});
```

## Logging Configuration

### Winston Logger (`config/logger.js`)

```javascript
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'rag-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
  }));
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
  }));
}

export default logger;
```

## Guardrails Configuration

### LLM Guardrails (`config/guardrails.js`)

```javascript
export const guardrailsConfig = {
  input: {
    maxLength: 5000,
    blockedPatterns: [
      /ignore previous instructions/i,
      /disregard.*system/i,
    ],
  },

  output: {
    hallucinationBlocking: {
      enabled: true,
      strictMode: process.env.STRICT_HALLUCINATION_MODE === 'true',
    },
    confidenceHandling: {
      minConfidence: 0.4,
      messages: {
        blocked: "I wasn't able to find reliable information about this topic in your documents.",
        warning: "Note: This answer has lower confidence.",
      },
    },
  },

  retrieval: {
    maxDocuments: 15,
    maxRetryDocuments: 20,
    minRelevanceScore: 0.3,
  },

  generation: {
    retry: {
      enabled: true,
      minConfidenceForRetry: 0.2,
      retryTimeoutMs: 30000,
      cooldownMs: 1000,
    },
  },
};
```

## Environment Variables

### Complete `.env.example`

```bash
# ===========================================
# Server Configuration
# ===========================================
PORT=3007
NODE_ENV=development
LOG_LEVEL=info

# ===========================================
# MongoDB
# ===========================================
MONGODB_URI=mongodb://localhost:27017/enterprise_rag

# ===========================================
# Redis
# ===========================================
REDIS_URL=redis://localhost:6378

# ===========================================
# Qdrant Vector Store
# ===========================================
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=documents

# ===========================================
# Azure OpenAI
# ===========================================
LLM_PROVIDER=azure_openai
EMBEDDING_PROVIDER=azure
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_API_VERSION=2024-02-15-preview
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2000
JUDGE_LLM_MODEL=gpt-4o-mini

# ===========================================
# Embedding Batching (optional — defaults shown)
# ===========================================
EMBEDDING_MAX_CONCURRENCY=10          # parallel API calls (S0 tier: 5-10 safe)
EMBEDDING_BATCH_MAX_CHUNKS=50         # max chunks per batch request
EMBEDDING_BATCH_MAX_TOKENS=8192       # max tokens per batch request
EMBEDDING_CONTEXT_TOKENS=8192         # model context window (for per-chunk truncation)

# ===========================================
# LLM Timeouts
# ===========================================
LLM_INVOKE_TIMEOUT=60000
LLM_STREAM_INITIAL_TIMEOUT=30000
LLM_STREAM_CHUNK_TIMEOUT=10000

# ===========================================
# JWT Authentication
# ===========================================
JWT_ACCESS_SECRET=             # generate: openssl rand -base64 48
JWT_REFRESH_SECRET=            # generate: openssl rand -base64 48
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ===========================================
# Encryption
# ===========================================
ENCRYPTION_KEY=                # generate: openssl rand -hex 32

# ===========================================
# CORS
# ===========================================
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# ===========================================
# Chunking Configuration
# ===========================================
MAX_GROUP_TOKENS=400
MIN_GROUP_TOKENS=200
MAX_LIST_ITEMS=15

# ===========================================
# Quality Guardrails
# ===========================================
GUARDRAIL_STRICT_HALLUCINATION_BLOCKING=true
ENABLE_CODE_FILTER=true

# ===========================================
# Observability
# ===========================================
LOG_RETRIEVAL_TRACE=false
LANGSMITH_API_KEY=your-langsmith-key
LANGSMITH_PROJECT=retrieva
LANGSMITH_ENABLED=true
```

## Configuration Validation

```javascript
// config/envValidator.js

const requiredVars = [
  'MONGODB_URI',
  'REDIS_HOST',
  'QDRANT_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

export function validateEnv() {
  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters');
  }
}
```
