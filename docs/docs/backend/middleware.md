---
sidebar_position: 4
---

# Middleware

Express middleware handles cross-cutting concerns like authentication, authorization, validation, and error handling.

## Middleware Stack

```
Request
    │
    ▼
┌─────────────────┐
│ Security        │ helmet, cors
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limiting   │ express-rate-limit
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Body Parsing    │ express.json, cookieParser
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Audit Trail     │ createAuditMiddleware (all requests)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PII Detection   │ piiDetectionMiddleware
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Abuse Detection │ detectAbuse (spam, rapid-fire, unusual hours)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Token Limits    │ checkTokenLimits (authenticated users)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authentication  │ authenticate
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Workspace Load  │ loadWorkspace
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authorization   │ requireWorkspaceAccess
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validation      │ validate(schema)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Controller      │ Route handler
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Error Handler   │ errorHandler
└─────────────────┘
```

## Authentication Middleware

### authenticate

Validates JWT tokens from cookies or headers.

```javascript
// middleware/auth.js

export const authenticate = catchAsync(async (req, res, next) => {
  // Get token from cookie or header
  const token = req.cookies.accessToken ||
                req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('Authentication required', 401);
  }

  try {
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Load user
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user) {
      throw new AppError('User not found', 401);
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new AppError('Account is not active', 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token expired', 401);
    }
    throw new AppError('Invalid token', 401);
  }
});
```

### optionalAuth

Attaches user if token present, but doesn't require it.

```javascript
export const optionalAuth = catchAsync(async (req, res, next) => {
  const token = req.cookies.accessToken ||
                req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId);
    } catch {
      // Ignore invalid token
    }
  }

  next();
});
```

## Workspace Middleware

### loadWorkspace

Loads workspace and verifies user access (BOLA protection).

```javascript
// middleware/loadWorkspace.js

export const loadWorkspace = catchAsync(async (req, res, next) => {
  const workspaceId = req.headers['x-workspace-id'] ||
                      req.body?.workspaceId ||
                      req.query?.workspaceId;

  if (!workspaceId) {
    throw new AppError('Workspace ID required', 400);
  }

  const workspace = await NotionWorkspace.findById(workspaceId);

  if (!workspace) {
    throw new AppError('Workspace not found', 404);
  }

  // BOLA Protection
  const userId = req.user._id.toString();
  const isMember = workspace.members?.some(
    m => m.user?.toString() === userId
  );
  const isOwner = workspace.owner?.toString() === userId;

  if (!isMember && !isOwner) {
    logger.warn('BOLA attempt detected', {
      userId,
      workspaceId,
      action: 'access_denied',
    });
    throw new AppError('Access denied to this workspace', 403);
  }

  req.workspace = workspace;
  next();
});
```

### requireWorkspaceAccess

Checks specific permissions.

```javascript
// middleware/workspaceAuth.js

export const requireWorkspaceAccess = (permission = 'canQuery') => {
  return catchAsync(async (req, res, next) => {
    const workspace = req.workspace;
    const userId = req.user._id.toString();

    // Owner has all permissions
    if (workspace.owner?.toString() === userId) {
      return next();
    }

    const member = workspace.members?.find(
      m => m.user?.toString() === userId
    );

    if (!member) {
      throw new AppError('Not a workspace member', 403);
    }

    if (!member.permissions?.[permission]) {
      throw new AppError(`Permission denied: ${permission}`, 403);
    }

    next();
  });
};

export const requireWorkspaceOwner = catchAsync(async (req, res, next) => {
  const workspace = req.workspace;
  const userId = req.user._id.toString();

  if (workspace.owner?.toString() !== userId) {
    throw new AppError('Owner access required', 403);
  }

  next();
});
```

## Validation Middleware

### validate

Validates request body against Joi schema.

```javascript
// middleware/validate.js

import Joi from 'joi';

export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(d => d.message);
      throw new AppError(`Validation failed: ${messages.join(', ')}`, 400);
    }

    req.body = value;  // Use sanitized value
    next();
  };
};

// Usage
router.post('/ask',
  authenticate,
  validate(askQuestionSchema),
  ragController.ask
);
```

### Validation Schemas

```javascript
// validators/schemas.js

export const askQuestionSchema = Joi.object({
  question: Joi.string().min(1).max(5000).required(),
  conversationId: Joi.string().optional(),
  filters: Joi.object({
    page: Joi.string(),
    section: Joi.string(),
    dateRange: Joi.object({
      start: Joi.date(),
      end: Joi.date(),
    }),
  }).optional(),
});

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(100).required(),
});
```

## Guardrails Middleware

Three middleware functions run globally on every request (mounted in `app.js` before routes):

### detectAbuse

Detects abusive usage patterns and blocks or flags offending users.

```javascript
// middleware/abuseDetection.js
export function detectAbuse(req, res, next) {
  const userId = req.user?.userId || req.ip;

  // Block if user is flagged
  if (isUserFlagged(userId)) {
    return res.status(429).json({ message: 'Too many requests', guardrail: 'abuse_detection' });
  }

  // Check: rapid-fire requests, identical question spam, unusual hours (2–5 AM)
  const detectedPatterns = [
    checkRapidRequests(userId),
    req.body?.question && checkIdenticalQuestions(userId, req.body.question),
    checkUnusualHours(),
  ].filter(Boolean);

  if (detectedPatterns.length > 0) {
    // Actions: temporary_block → 429, flag_and_captcha → continue + flag, flag_for_review → continue + flag
  }

  next();
}
```

Patterns detected:
- **Rapid requests** — too many requests within a sliding window
- **Identical question spam** — same question asked repeatedly (MD5 hash comparison)
- **Unusual hours** — requests between 2–5 AM flagged for review

### checkTokenLimits

Checks daily and monthly token usage for authenticated users. Unauthenticated requests pass through automatically.

```javascript
// middleware/abuseDetection.js
export async function checkTokenLimits(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next(); // skip unauthenticated

  const limits = await TokenUsage.checkLimits(userId);
  if (!limits.allowed) {
    return res.status(429).json({ message: 'Token usage limit exceeded', guardrail: 'token_limits' });
  }
  req.tokenLimits = limits;
  next();
}
```

### createAuditMiddleware

Logs every request with method, path, status code, response time, and user/workspace context. Excludes `/health`, `/api-docs`, `/favicon.ico`.

## Rate Limiting

### Global Rate Limiter

Applied to all `/api/*` routes in `app.js`. Skips `/sync-status` (used for monitoring).

```javascript
// app.js
const limiter = rateLimit({
  max: 1000,                    // 1 000 requests per IP per hour
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
  skip: (req) => req.path.includes('/sync-status'),
});
app.use('/api', limiter);
```

### Endpoint-Specific Limiters (`middleware/ragRateLimiter.js`)

Route-level limiters applied on top of the global budget. All are keyed by **user ID** for authenticated callers (falling back to IP for anonymous), so shared NAT addresses do not affect multiple users.

| Export | Route | Limit | Window |
|--------|-------|-------|--------|
| `ragQueryLimiter` | `POST /rag/query` | 100 (auth) / 20 (anon) | 1 hour |
| `ragStreamLimiter` | `POST /rag/stream` | 50 (auth) / 10 (anon) | 1 hour |
| `ragBurstLimiter` | `POST /rag/*` | 5 | 10 seconds |
| `evaluationLimiter` | `POST /ragas/evaluate` | 10 | 1 hour |
| `notificationCountLimiter` | `GET /notifications/count` | 120 | 1 hour |

#### `notificationCountLimiter`

Added to prevent the notification badge poll from consuming the shared global budget. The frontend uses WebSocket push as the primary update path; HTTP is only used for the initial count on mount and a 5-minute reconciliation poll. 120 req/hr provides headroom for multiple open tabs and manual refreshes.

```javascript
// Applied only to GET /notifications/count in notificationRoutes.js
router.get('/count', notificationCountLimiter, getUnreadCount);
```

## Error Handling

### Error Handler Middleware

```javascript
// middleware/errorHandler.js

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error
  logger.error('Request error', {
    statusCode: err.statusCode,
    message: err.message,
    path: req.path,
    method: req.method,
    userId: req.user?._id,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Development: send full error
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      error: err,
      stack: err.stack,
    });
  }

  // Production: hide internal errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // Unknown error - don't leak details
  return res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
  });
};
```

### catchAsync Wrapper

```javascript
// utils/core/asyncHelpers.js

export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Usage
export const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  sendSuccess(res, { user });
});
```

## Security Middleware

### CSRF Protection

```javascript
// middleware/csrfProtection.js

import csrf from 'csurf';

export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
});

// Provide token to client
router.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

### Audit Trail

```javascript
// middleware/auditTrail.js

export const auditTrail = (action) => {
  return catchAsync(async (req, res, next) => {
    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end;

    res.end = function(...args) {
      // Log after response
      logger.info('Audit log', {
        action,
        userId: req.user?._id,
        workspaceId: req.workspace?._id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      originalEnd.apply(this, args);
    };

    next();
  });
};

// Usage
router.delete('/workspace/:id',
  authenticate,
  loadWorkspace,
  requireWorkspaceOwner,
  auditTrail('workspace_delete'),
  workspaceController.delete
);
```

## Middleware Composition

### Route Example

```javascript
// routes/ragRoutes.js

import { Router } from 'express';

const router = Router();

router.post('/ask',
  authenticate,                         // 1. Verify JWT
  loadWorkspace,                        // 2. Load workspace, BOLA check
  requireWorkspaceAccess('canQuery'),   // 3. Check permission
  validate(askQuestionSchema),          // 4. Validate body
  auditTrail('rag_query'),             // 5. Log action
  ragController.ask                     // 6. Handle request
);

router.post('/stream',
  authenticate,
  loadWorkspace,
  requireWorkspaceAccess('canQuery'),
  validate(askQuestionSchema),
  streamingController.stream
);

export default router;
```
