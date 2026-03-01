import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { httpLogger } from './config/httpLogger.js';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import compression from 'compression';
import { securitySanitizer } from './middleware/securitySanitizer.js';
import { ragRoutes } from './routes/ragRoutes.js';
import { conversationRoutes } from './routes/conversationRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import dataSourceRoutes from './routes/dataSourceRoutes.js';
import complianceRoutes from './routes/complianceRoutes.js';
import questionnaireRoutes from './routes/questionnaireRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import logger from './config/logger.js';
import { globalErrorHandler } from './utils/index.js';

// =============================================================================
// ISSUE #12 FIX: Global Request Timeout Configuration
// =============================================================================
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000; // 30s default
const STREAMING_TIMEOUT_MS = parseInt(process.env.STREAMING_TIMEOUT_MS) || 180000; // 3 min for streaming
const SYNC_TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT_MS) || 600000; // 10 min for sync operations

import { piiDetectionMiddleware } from './utils/security/piiMasker.js';

const app = express();

// =============================================================================
// ISSUE #28 FIX: Request ID Tracking for Distributed Tracing
// =============================================================================
// Assigns a unique ID to each request for logging and debugging
app.use((req, res, next) => {
  // Use existing request ID from header (e.g., from load balancer) or generate new one
  const requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Attach to logger context for this request
  req.logContext = { requestId };

  next();
});

// =============================================================================
// CORS Configuration - Whitelist allowed origins
// =============================================================================
const getAllowedOrigins = () => {
  // In production, use environment variable for allowed origins
  const envOrigins = process.env.ALLOWED_ORIGINS;

  if (envOrigins) {
    // Parse comma-separated origins from environment
    return envOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  // Development defaults
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return [
      'http://localhost:3000', // React dev server
      'http://localhost:3001', // Alternative frontend port
      'http://localhost:5173', // Vite dev server
      'http://localhost:5174', // Vite alternative port
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ];
  }

  // Production: require explicit configuration
  logger.warn(
    'CORS: No ALLOWED_ORIGINS configured. Set ALLOWED_ORIGINS environment variable for production.'
  );
  return [];
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0) {
      // No origins configured - reject in production, allow in dev
      if (process.env.NODE_ENV === 'production') {
        logger.warn('CORS: Request blocked - no allowed origins configured', { origin });
        return callback(new Error('CORS not configured for production'));
      }
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn('CORS: Request from unauthorized origin blocked', { origin, allowedOrigins });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies for authentication
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Workspace-Id'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// Log CORS configuration on startup
if (allowedOrigins.length > 0) {
  logger.info('CORS configured with allowed origins', { origins: allowedOrigins });
} else if (process.env.NODE_ENV === 'development') {
  logger.info('CORS: Development mode - all origins allowed');
}

// Set security-related HTTP headers
app.use(helmet());

// Limit requests from same API
const limiter = rateLimit({
  max: 1000, // Increased for development/monitoring
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
  skip: (req) => {
    // Skip rate limiting for sync-status endpoint (monitoring)
    return req.path.includes('/sync-status');
  },
});
app.use('/api', limiter);

// =============================================================================
// ISSUE #12 FIX: Global Request Timeout Middleware
// =============================================================================
// Prevents hung requests from blocking the server indefinitely
app.use((req, res, next) => {
  // Determine timeout based on endpoint
  let timeout = REQUEST_TIMEOUT_MS;

  // Streaming endpoints get longer timeout
  if (req.path.includes('/stream') || req.path.includes('/sse')) {
    timeout = STREAMING_TIMEOUT_MS;
  }

  // Sync operations get even longer timeout
  if (req.path.includes('/sync')) {
    timeout = SYNC_TIMEOUT_MS;
  }

  // Health checks should be fast
  if (req.path.includes('/health')) {
    timeout = 5000; // 5 seconds
  }

  // Set request timeout
  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      logger.warn('Request timeout', {
        method: req.method,
        path: req.path,
        timeoutMs: timeout,
        ip: req.ip,
      });
      res.status(503).json({
        status: 'error',
        message: 'Request timeout - the server took too long to respond',
        code: 'REQUEST_TIMEOUT',
      });
    }
  });

  // Also set socket timeout for long-running connections
  if (req.socket) {
    req.socket.setTimeout(timeout + 5000); // Socket timeout slightly longer
  }

  next();
});

// HTTP Request Logger (pino-http)
app.use(httpLogger);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser
app.use(cookieParser());

// Data sanitization against NoSQL query injection and XSS
// Using custom Express 5 compatible middleware
app.use(securitySanitizer());

// Prevent parameter pollution
app.use(hpp());

// Compress all responses (skip SSE streaming endpoints to avoid buffering)
app.use(
  compression({
    filter: (req, res) => {
      // SSE endpoints must not be compressed - compression buffers writes
      // which breaks real-time event delivery
      if (req.path === '/api/v1/rag/stream') {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// PII detection in requests
app.use(piiDetectionMiddleware(['question', 'content', 'message']));

// Health check routes (no /api prefix for Kubernetes probes)
app.use('/health', healthRoutes);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', ragRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/data-sources', dataSourceRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/questionnaires', questionnaireRoutes);
app.use('/api/v1/organizations', organizationRoutes);

app.get('/', (req, res) => {
  res.send('Hello from a secure app.js!');
});

// Global error handler
app.use(globalErrorHandler);

export default app;
