---
sidebar_position: 5
---

# Multi-Tenancy Architecture

The platform implements a robust multi-tenant architecture ensuring complete data isolation between workspaces. This is critical for security when multiple users or organizations share the same platform instance.

## Three-Layer Protection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Request Flow                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 1: Middleware Authorization                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  authenticate → loadWorkspace → requireWorkspaceAccess          │   │
│  │                                                                  │   │
│  │  • JWT validation                                                │   │
│  │  • Workspace membership check                                    │   │
│  │  • Permission verification (canQuery, canInvite, etc.)          │   │
│  │  • BOLA protection                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 2: Database-Level Isolation                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  AsyncLocalStorage Tenant Context                                │   │
│  │                                                                  │   │
│  │  • Request-scoped context                                        │   │
│  │  • Automatic query filtering                                     │   │
│  │  • Cross-tenant access detection                                 │   │
│  │  • Mongoose plugin integration                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Layer 3: Vector Store Isolation                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Mandatory Qdrant Filter                                         │   │
│  │                                                                  │   │
│  │  • workspaceId REQUIRED for all queries                          │   │
│  │  • Throws error if missing                                       │   │
│  │  • All chunks tagged with workspaceId                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Layer 1: Middleware Authorization

### Authentication Middleware

```javascript
// middleware/auth.js

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('Authentication required', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new AppError('User not found', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    next(new AppError('Invalid token', 401));
  }
};
```

### Workspace Loading with BOLA Protection

```javascript
// middleware/loadWorkspace.js

export const loadWorkspace = async (req, res, next) => {
  try {
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

    // BOLA Protection: Verify user access
    const isMember = workspace.members?.some(
      m => m.user?.toString() === req.user._id.toString()
    );
    const isOwner = workspace.owner?.toString() === req.user._id.toString();

    if (!isMember && !isOwner) {
      logger.warn('BOLA attempt detected', {
        userId: req.user._id,
        workspaceId,
        action: 'access_denied',
      });
      throw new AppError('Access denied to this workspace', 403);
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    next(error);
  }
};
```

### Permission Verification

```javascript
// middleware/workspaceAuth.js

export const requireWorkspaceAccess = (permission = 'canQuery') => {
  return async (req, res, next) => {
    const workspace = req.workspace;
    const userId = req.user._id.toString();

    // Owner has all permissions
    if (workspace.owner?.toString() === userId) {
      return next();
    }

    // Check member permissions
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
  };
};

export const requireWorkspaceOwner = async (req, res, next) => {
  const workspace = req.workspace;
  const userId = req.user._id.toString();

  if (workspace.owner?.toString() !== userId) {
    throw new AppError('Owner access required', 403);
  }

  next();
};
```

## Layer 2: Database-Level Isolation

### AsyncLocalStorage Context

```javascript
// services/tenantIsolation.js

import { AsyncLocalStorage } from 'async_hooks';

const tenantContext = new AsyncLocalStorage();

export function withTenantContext(context, fn) {
  return tenantContext.run(context, fn);
}

export function getCurrentTenant() {
  return tenantContext.getStore();
}
```

### Mongoose Plugin

```javascript
// services/tenantIsolation.js

export function tenantIsolationPlugin(schema) {
  // Auto-filter queries by workspaceId
  schema.pre(['find', 'findOne', 'countDocuments', 'aggregate'], function() {
    const ctx = getCurrentTenant();

    if (ctx?.workspaceId && !this._skipTenantFilter) {
      this.where({ workspaceId: ctx.workspaceId });
    }
  });

  // Detect cross-tenant access attempts
  schema.post(['find', 'findOne'], function(docs) {
    const ctx = getCurrentTenant();

    if (!ctx?.workspaceId) return;

    const results = Array.isArray(docs) ? docs : [docs].filter(Boolean);

    for (const doc of results) {
      if (doc.workspaceId && doc.workspaceId.toString() !== ctx.workspaceId) {
        logger.error('Cross-tenant access detected!', {
          requestedWorkspace: ctx.workspaceId,
          documentWorkspace: doc.workspaceId,
          documentId: doc._id,
        });
        throw new Error('Cross-tenant access violation');
      }
    }
  });
}
```

### Usage in Controllers

```javascript
// controllers/ragController.js

export const askQuestion = catchAsync(async (req, res) => {
  const { question } = req.body;
  const workspaceId = req.workspace._id;
  const userId = req.user._id;

  // Run entire operation within tenant context
  const result = await withTenantContext(
    { workspaceId: workspaceId.toString(), userId: userId.toString() },
    async () => {
      return ragService.askWithConversation(question, {
        conversationId,
        workspaceId,
      });
    }
  );

  sendSuccess(res, result);
});
```

## Layer 3: Vector Store Isolation

### Mandatory Workspace Filter

```javascript
// services/rag/queryRetrieval.js

export function buildQdrantFilter(filters, workspaceId) {
  // CRITICAL: workspaceId is always required
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new Error(
      'workspaceId is required for vector store queries (multi-tenant isolation)'
    );
  }

  const qdrantFilter = { must: [] };

  // ALWAYS add workspace filter first
  qdrantFilter.must.push({
    key: 'metadata.workspaceId',
    match: { value: workspaceId },
  });

  // Additional optional filters
  if (filters?.page) {
    qdrantFilter.must.push({
      key: 'metadata.sourceId',
      match: { value: filters.page },
    });
  }

  if (filters?.section) {
    qdrantFilter.must.push({
      key: 'metadata.section',
      match: { value: filters.section },
    });
  }

  return qdrantFilter;
}
```

### Chunk Indexing with Workspace

```javascript
// workers/documentIndexWorker.js

async function indexDocument(job) {
  const { workspaceId, sourceId, documentContent } = job.data;

  // Chunk the document
  const chunks = await prepareNotionDocumentForIndexing(
    documentContent,
    workspaceId  // Every chunk tagged with workspaceId
  );

  // Each chunk has workspaceId in metadata
  for (const chunk of chunks) {
    console.assert(
      chunk.metadata.workspaceId === workspaceId,
      'Chunk must have workspaceId'
    );
  }

  // Index in Qdrant with workspace isolation
  await vectorStore.addDocuments(chunks);
}
```

## Permission Model

### Workspace Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `owner` | Workspace creator | All permissions |
| `admin` | Administrator | Manage members, sync |
| `member` | Regular member | Query, view sources |
| `viewer` | Read-only access | Query only |

### Permission Flags

```javascript
const MemberPermissions = {
  canQuery: Boolean,        // Ask questions
  canViewSources: Boolean,  // View source documents
  canInvite: Boolean,       // Invite new members
  canManageSync: Boolean,   // Trigger syncs
  canEditSettings: Boolean, // Modify workspace settings
};
```

### Role-Permission Mapping

```javascript
const ROLE_PERMISSIONS = {
  owner: {
    canQuery: true,
    canViewSources: true,
    canInvite: true,
    canManageSync: true,
    canEditSettings: true,
  },
  admin: {
    canQuery: true,
    canViewSources: true,
    canInvite: true,
    canManageSync: true,
    canEditSettings: false,
  },
  member: {
    canQuery: true,
    canViewSources: true,
    canInvite: false,
    canManageSync: false,
    canEditSettings: false,
  },
  viewer: {
    canQuery: true,
    canViewSources: false,
    canInvite: false,
    canManageSync: false,
    canEditSettings: false,
  },
};
```

## Security Properties

| Property | Implementation |
|----------|---------------|
| **No Cross-Tenant Reads** | Qdrant filter + Mongoose plugin |
| **No Cross-Tenant Writes** | Middleware + tenant context |
| **BOLA Prevention** | Explicit membership verification |
| **Privilege Escalation Prevention** | Role-based permissions |
| **Audit Trail** | All access logged with context |

## Testing Isolation

```javascript
// Test that cross-tenant access is blocked
describe('Multi-Tenancy', () => {
  it('should block access to other workspace documents', async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    const workspace1 = await createWorkspace(user1);
    const workspace2 = await createWorkspace(user2);

    // Index document in workspace1
    await indexDocument(workspace1._id, 'Secret document');

    // Try to query from workspace2
    const result = await ragService.askWithConversation(
      'Show me the secret document',
      { workspaceId: workspace2._id, userId: user2._id }
    );

    // Should not find workspace1's document
    expect(result.sources).toHaveLength(0);
  });

  it('should throw on missing workspaceId', async () => {
    await expect(
      buildQdrantFilter({}, null)
    ).rejects.toThrow('workspaceId is required');
  });
});
```
