import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { securitySanitizer } from './middleware/securitySanitizer.js';
import { csrfProtection, getCsrfToken } from './middleware/csrfProtection.js';
import { ragRoutes } from './routes/ragRoutes.js';
import { conversationRoutes } from './routes/conversationRoutes.js';
import notionRoutes from './routes/notionRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import evaluationRoutes from './routes/evaluationRoutes.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { guardrailsRoutes } from './routes/guardrailsRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import presenceRoutes from './routes/presenceRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import logger from './config/logger.js';
import { globalErrorHandler } from './utils/index.js';
import { swaggerDocument } from './docs/swagger.js';

// Guardrails middleware
import { detectAbuse, checkTokenLimits } from './middleware/abuseDetection.js';
import { createAuditMiddleware } from './middleware/auditTrail.js';
import { piiDetectionMiddleware } from './utils/security/piiMasker.js';

const app = express();

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

// HTTP Request Logger (Morgan) - logs to Winston
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

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

// Compress all responses
app.use(compression());

// CSRF Protection (after cookie parser, before routes)
// Disabled by default for API-first approach, enable with CSRF_ENABLED=true
app.use(
  csrfProtection({
    enabled: process.env.CSRF_ENABLED === 'true',
  })
);

// CSRF token endpoint (for clients that need to fetch token)
app.get('/api/v1/csrf-token', getCsrfToken);

// GUARDRAILS: Audit trail middleware (logs all requests)
app.use(
  createAuditMiddleware({
    excludePaths: ['/health', '/api-docs', '/favicon.ico'],
  })
);

// GUARDRAILS: PII detection in requests
app.use(piiDetectionMiddleware(['question', 'content', 'message']));

// Health check routes (no /api prefix for Kubernetes probes)
app.use('/health', healthRoutes);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', ragRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/notion', notionRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/evaluation', evaluationRoutes);
app.use('/api/v1/guardrails', guardrailsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/presence', presenceRoutes);
app.use('/api/v1/memory', memoryRoutes);

// OpenAPI/Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.send('Hello from a secure app.js!');
});

// Global error handler
app.use(globalErrorHandler);

export default app;
