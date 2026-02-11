---
sidebar_position: 3
---

# Authorization

Role-based access control (RBAC) and workspace-level permissions.

## Authorization Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Authorization Flow                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Request                                                                │
│      │                                                                   │
│      ▼                                                                   │
│   ┌──────────────┐                                                      │
│   │ Authenticate │ ◀─── Is user logged in?                              │
│   └──────┬───────┘                                                      │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────┐                                                      │
│   │Load Workspace│ ◀─── Does workspace exist?                           │
│   └──────┬───────┘                                                      │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────┐                                                      │
│   │ BOLA Check   │ ◀─── Is user member or owner?                        │
│   └──────┬───────┘                                                      │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────┐                                                      │
│   │ Permission   │ ◀─── Does user have required permission?             │
│   │    Check     │                                                      │
│   └──────┬───────┘                                                      │
│          │                                                               │
│          ▼                                                               │
│      Authorized                                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Workspace Roles

| Role | Description | Use Case |
|------|-------------|----------|
| `owner` | Workspace creator | Full control |
| `admin` | Administrator | Manage members, settings |
| `member` | Regular member | Query, view sources |
| `viewer` | Read-only | Query only |

## Permission Flags

```javascript
const permissions = {
  canQuery: Boolean,        // Ask questions
  canViewSources: Boolean,  // View source documents
  canInvite: Boolean,       // Invite new members
  canManageSync: Boolean,   // Trigger syncs
  canEditSettings: Boolean, // Modify workspace settings
};
```

## Role-Permission Matrix

| Permission | Owner | Admin | Member | Viewer |
|------------|:-----:|:-----:|:------:|:------:|
| canQuery | ✅ | ✅ | ✅ | ✅ |
| canViewSources | ✅ | ✅ | ✅ | ❌ |
| canInvite | ✅ | ✅ | ❌ | ❌ |
| canManageSync | ✅ | ✅ | ❌ | ❌ |
| canEditSettings | ✅ | ❌ | ❌ | ❌ |
| Delete Workspace | ✅ | ❌ | ❌ | ❌ |

## BOLA Protection

Broken Object Level Authorization (BOLA) protection ensures users can only access their own workspaces:

```javascript
// middleware/loadWorkspace.js

export const loadWorkspace = async (req, res, next) => {
  const workspaceId = req.headers['x-workspace-id'];

  const workspace = await NotionWorkspace.findById(workspaceId);

  if (!workspace) {
    throw new AppError('Workspace not found', 404);
  }

  // BOLA Check: Verify user belongs to this workspace
  const userId = req.user._id.toString();
  const isMember = workspace.members?.some(
    m => m.user?.toString() === userId && m.status === 'active'
  );
  const isOwner = workspace.owner?.toString() === userId;

  if (!isMember && !isOwner) {
    logger.warn('BOLA attempt detected', {
      event: 'bola_attempt',
      userId: req.user._id,
      workspaceId,
      ip: req.ip,
    });
    throw new AppError('Access denied to this workspace', 403);
  }

  req.workspace = workspace;
  next();
};
```

## Permission Middleware

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

    // Find member
    const member = workspace.members?.find(
      m => m.user?.toString() === userId && m.status === 'active'
    );

    if (!member) {
      throw new AppError('Not a workspace member', 403);
    }

    // Check specific permission
    if (!member.permissions?.[permission]) {
      logger.warn('Permission denied', {
        event: 'permission_denied',
        userId: req.user._id,
        workspaceId: workspace._id,
        permission,
      });
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

export const canInviteMembers = requireWorkspaceAccess('canInvite');
export const canManageSync = requireWorkspaceAccess('canManageSync');
```

## Route Protection Examples

```javascript
// routes/ragRoutes.js

router.post('/ask',
  authenticate,                         // 1. Must be logged in
  loadWorkspace,                        // 2. Load workspace, BOLA check
  requireWorkspaceAccess('canQuery'),   // 3. Check canQuery permission
  ragController.ask
);

// routes/notionRoutes.js

router.post('/sync',
  authenticate,
  loadWorkspace,
  requireWorkspaceAccess('canManageSync'),  // Only admins/owners
  notionController.triggerSync
);

// routes/workspaceRoutes.js

router.delete('/:id',
  authenticate,
  loadWorkspace,
  requireWorkspaceOwner,  // Only owner can delete
  workspaceController.delete
);

router.post('/:id/members',
  authenticate,
  loadWorkspace,
  requireWorkspaceAccess('canInvite'),  // Must have invite permission
  workspaceController.addMember
);
```

## Database-Level Tenant Isolation

The platform uses AsyncLocalStorage to automatically filter queries:

```javascript
// services/tenantIsolation.js

import { AsyncLocalStorage } from 'async_hooks';

const tenantContext = new AsyncLocalStorage();

export function withTenantContext(context, fn) {
  return tenantContext.run(context, fn);
}

export function tenantIsolationPlugin(schema) {
  // Auto-filter all queries by workspaceId
  schema.pre(['find', 'findOne', 'countDocuments'], function() {
    const ctx = tenantContext.getStore();
    if (ctx?.workspaceId) {
      this.where({ workspaceId: ctx.workspaceId });
    }
  });

  // Detect cross-tenant access
  schema.post(['find', 'findOne'], function(docs) {
    const ctx = tenantContext.getStore();
    if (!ctx?.workspaceId) return;

    const results = Array.isArray(docs) ? docs : [docs].filter(Boolean);
    for (const doc of results) {
      if (doc.workspaceId?.toString() !== ctx.workspaceId) {
        logger.error('Cross-tenant access detected!', {
          event: 'cross_tenant_access',
          requestedWorkspace: ctx.workspaceId,
          documentWorkspace: doc.workspaceId,
        });
        throw new Error('Cross-tenant access violation');
      }
    }
  });
}
```

## Vector Store Isolation

Every Qdrant query MUST include workspace filter:

```javascript
// services/rag/queryRetrieval.js

export function buildQdrantFilter(filters, workspaceId) {
  if (!workspaceId) {
    throw new Error('workspaceId is required for vector store queries');
  }

  return {
    must: [
      { key: 'metadata.workspaceId', match: { value: workspaceId } },
      // Additional filters...
    ]
  };
}
```

## Audit Trail

All authorization events are logged:

```javascript
logger.info('Authorization event', {
  event: 'access_granted',
  userId: req.user._id,
  workspaceId: req.workspace._id,
  permission: 'canQuery',
  resource: '/api/v1/rag',
  timestamp: new Date(),
});
```
