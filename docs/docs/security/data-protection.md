---
sidebar_position: 5
---

# Data Protection

Encryption, data isolation, and privacy measures.

## Encryption

### Encryption at Rest

#### Notion Token Encryption

```javascript
// utils/security/crypto.js

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // authTagLength: 16 explicitly enforces 128-bit GCM authentication tag verification
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

#### Key Management

```bash
# Generate a secure 32-byte key
openssl rand -hex 32

# Store in environment
ENCRYPTION_KEY=your-32-byte-hex-key
```

### Encryption in Transit

- All external communication uses HTTPS/TLS 1.3
- Internal services communicate over encrypted channels
- WebSocket connections use WSS

## Data Isolation

### Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Isolation Layers                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Application Layer                                               │   │
│   │  • Middleware authorization                                      │   │
│   │  • BOLA protection                                               │   │
│   │  • Permission verification                                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Database Layer                                                  │   │
│   │  • Mongoose tenant isolation plugin                              │   │
│   │  • Automatic query filtering                                     │   │
│   │  • Cross-tenant detection                                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Vector Store Layer                                              │   │
│   │  • Mandatory workspaceId filter                                  │   │
│   │  • All chunks tagged with workspace                              │   │
│   │  • No cross-workspace queries possible                           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Isolation

```javascript
// Every document is tagged with workspaceId
const documentSourceSchema = new Schema({
  workspaceId: {
    type: String,
    required: true,
    index: true,
  },
  // ... other fields
});

// Mongoose plugin auto-filters queries
schema.pre(['find', 'findOne'], function() {
  const ctx = getCurrentTenant();
  if (ctx?.workspaceId) {
    this.where({ workspaceId: ctx.workspaceId });
  }
});
```

### Vector Store Isolation

```javascript
// Every chunk includes workspaceId in metadata
{
  pageContent: "...",
  metadata: {
    workspaceId: "ws-123",  // Mandatory
    // ... other metadata
  }
}

// All queries require workspaceId filter
function buildQdrantFilter(filters, workspaceId) {
  if (!workspaceId) {
    throw new Error('workspaceId is required');
  }

  return {
    must: [
      { key: 'metadata.workspaceId', match: { value: workspaceId } }
    ]
  };
}
```

## Data Retention

### Conversation Data

```javascript
// Messages TTL: 90 days
messageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);
```

### Analytics Data

```javascript
// Analytics TTL: 90 days
analyticsSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);
```

### Sync Job History

```javascript
// Sync jobs TTL: 30 days
syncJobSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);
```

## Data Deletion

### User Deletion

```javascript
async function deleteUser(userId) {
  // 1. Find all user's owned workspaces
  const workspaces = await NotionWorkspace.find({ owner: userId });

  for (const workspace of workspaces) {
    await deleteWorkspace(workspace._id);
  }

  // 2. Remove user from member lists
  await NotionWorkspace.updateMany(
    { 'members.user': userId },
    { $pull: { members: { user: userId } } }
  );

  // 3. Delete user record
  await User.findByIdAndDelete(userId);

  logger.info('User deleted', { userId });
}
```

### Workspace Deletion

```javascript
async function deleteWorkspace(workspaceId) {
  // 1. Delete from vector store
  await qdrantClient.delete(COLLECTION_NAME, {
    filter: {
      must: [{ key: 'metadata.workspaceId', match: { value: workspaceId } }]
    }
  });

  // 2. Delete MongoDB documents
  await Promise.all([
    DocumentSource.deleteMany({ workspaceId }),
    Conversation.deleteMany({ workspaceId }),
    Message.deleteMany({ conversationId: { $in: conversationIds } }),
    SyncJob.deleteMany({ workspaceId }),
    Analytics.deleteMany({ workspaceId }),
  ]);

  // 3. Delete workspace record
  await NotionWorkspace.findByIdAndDelete(workspaceId);

  logger.info('Workspace deleted', { workspaceId });
}
```

## Sensitive Data Handling

### Password Storage

```javascript
// Never store plain passwords
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
```

### Token Storage

```javascript
// Refresh tokens stored hashed
user.refreshToken = await bcrypt.hash(refreshToken, 10);

// Notion tokens stored encrypted
workspace.accessToken = encrypt(accessToken);
```

### Logging Safety

```javascript
// Never log sensitive data
logger.info('User action', {
  userId: user._id,
  // DO NOT log: password, tokens, personal data
});

// Mask sensitive fields in error logs
function sanitizeError(error) {
  const sanitized = { ...error };
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.accessToken;
  return sanitized;
}
```

## Compliance Considerations

### GDPR

- Data portability via export endpoints
- Right to deletion implemented
- Consent management for Notion OAuth
- Data processing logs available

### Data Minimization

- Only collect necessary data
- Clear data after retention period
- No tracking beyond functionality

### Access Logs

```javascript
// Log all data access
logger.info('Data access', {
  event: 'data_access',
  userId: req.user._id,
  resource: 'documents',
  workspaceId: req.workspace._id,
  action: 'read',
  timestamp: new Date(),
});
```
