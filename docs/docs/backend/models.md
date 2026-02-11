---
sidebar_position: 5
---

# Models

Mongoose models define the data schema and provide an interface to MongoDB.

## User Model

```javascript
// models/User.js

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    select: false,  // Don't include in queries by default
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  refreshToken: {
    type: String,
    select: false,
  },
  lastLoginAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model('User', userSchema);
```

## NotionWorkspace Model

```javascript
// models/NotionWorkspace.js

const memberSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'member', 'viewer'],
    default: 'member',
  },
  permissions: {
    canQuery: { type: Boolean, default: true },
    canViewSources: { type: Boolean, default: true },
    canInvite: { type: Boolean, default: false },
    canManageSync: { type: Boolean, default: false },
    canEditSettings: { type: Boolean, default: false },
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'removed'],
    default: 'active',
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

const notionWorkspaceSchema = new Schema({
  workspaceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  workspaceName: {
    type: String,
    required: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [memberSchema],
  accessToken: {
    type: String,
    required: true,
    select: false,  // Encrypted token
  },
  refreshToken: {
    type: String,
    select: false,
  },
  syncStatus: {
    type: String,
    enum: ['idle', 'syncing', 'error', 'active'],
    default: 'idle',
  },
  syncSchedule: {
    enabled: { type: Boolean, default: true },
    intervalHours: { type: Number, default: 24 },
    lastScheduledAt: Date,
  },
  stats: {
    totalPages: { type: Number, default: 0 },
    totalDatabases: { type: Number, default: 0 },
    totalDocuments: { type: Number, default: 0 },
    lastSyncDuration: Number,
    errorCount: { type: Number, default: 0 },
  },
  lastSuccessfulSyncAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt token before saving
notionWorkspaceSchema.pre('save', async function(next) {
  if (this.isModified('accessToken')) {
    this.accessToken = encrypt(this.accessToken);
  }
  next();
});

// Decrypt token method
notionWorkspaceSchema.methods.getDecryptedToken = function() {
  return decrypt(this.accessToken);
};

// Update sync status
notionWorkspaceSchema.methods.updateSyncStatus = async function(status, jobId) {
  this.syncStatus = status;
  if (jobId) this.currentSyncJobId = jobId;
  return this.save();
};

export const NotionWorkspace = model('NotionWorkspace', notionWorkspaceSchema);
```

## Conversation Model

```javascript
// models/Conversation.js

const conversationSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'NotionWorkspace',
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New Conversation',
  },
  messageCount: {
    type: Number,
    default: 0,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
  },
  metadata: {
    intents: [String],
    topics: [String],
    averageConfidence: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient queries
conversationSchema.index({ workspaceId: 1, userId: 1, status: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Virtual for messages
conversationSchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
});

export const Conversation = model('Conversation', conversationSchema);
```

## Message Model

```javascript
// models/Message.js

const messageSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  metadata: {
    sources: [{
      sourceNumber: Number,
      title: String,
      url: String,
      section: String,
    }],
    confidence: Number,
    intent: String,
    processingTime: Number,
    citedSources: [Number],
    isGrounded: Boolean,
    hasHallucinations: Boolean,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound index for efficient conversation queries
messageSchema.index({ conversationId: 1, timestamp: 1 });

export const Message = model('Message', messageSchema);
```

## DocumentSource Model

```javascript
// models/DocumentSource.js

const documentSourceSchema = new Schema({
  workspaceId: {
    type: String,
    required: true,
    index: true,
  },
  sourceType: {
    type: String,
    enum: ['notion', 'pdf', 'web'],
    default: 'notion',
  },
  sourceId: {
    type: String,
    required: true,
  },
  documentType: {
    type: String,
    enum: ['page', 'database', 'file'],
    default: 'page',
  },
  title: {
    type: String,
    required: true,
  },
  url: String,
  contentHash: {
    type: String,
    index: true,
  },
  syncStatus: {
    type: String,
    enum: ['pending', 'indexed', 'error', 'deleted'],
    default: 'pending',
  },
  chunkCount: {
    type: Number,
    default: 0,
  },
  vectorStoreIds: [String],
  lastModifiedInSource: Date,
  lastIndexedAt: Date,
  metadata: {
    author: String,
    createdAt: Date,
    properties: Schema.Types.Mixed,
    parentId: String,
    parentType: String,
  },
  error: {
    message: String,
    timestamp: Date,
    retryCount: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index
documentSourceSchema.index({ workspaceId: 1, sourceId: 1 }, { unique: true });

// Mark as deleted
documentSourceSchema.methods.markAsDeleted = async function() {
  this.syncStatus = 'deleted';
  this.deletedAt = new Date();
  return this.save();
};

export const DocumentSource = model('DocumentSource', documentSourceSchema);
```

## SyncJob Model

```javascript
// models/SyncJob.js

const syncJobSchema = new Schema({
  jobId: {
    type: String,
    required: true,
    index: true,
  },
  workspaceId: {
    type: String,
    required: true,
    index: true,
  },
  jobType: {
    type: String,
    enum: ['full_sync', 'incremental_sync'],
    required: true,
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'queued',
  },
  triggeredBy: {
    type: String,
    enum: ['manual', 'scheduled', 'auto', 'webhook'],
    default: 'manual',
  },
  progress: {
    totalDocuments: Number,
    processedDocuments: Number,
    successCount: Number,
    errorCount: Number,
    skippedCount: Number,
    currentDocument: String,
  },
  results: {
    documentsAdded: Number,
    documentsUpdated: Number,
    documentsDeleted: Number,
    errors: [{
      documentId: String,
      error: String,
      timestamp: Date,
    }],
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  error: {
    message: String,
    timestamp: Date,
  },
  startedAt: Date,
  completedAt: Date,
  duration: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Update progress
syncJobSchema.methods.updateProgress = async function(progress) {
  Object.assign(this.progress, progress);
  return this.save();
};

// Complete job
syncJobSchema.methods.complete = async function(results) {
  this.status = 'completed';
  this.results = results;
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  return this.save();
};

// Fail job
syncJobSchema.methods.fail = async function(error) {
  this.status = 'failed';
  this.error = {
    message: error.message,
    timestamp: new Date(),
  };
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  return this.save();
};

export const SyncJob = model('SyncJob', syncJobSchema);
```

## Analytics Model

```javascript
// models/Analytics.js

const analyticsSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'NotionWorkspace',
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    enum: ['query', 'sync', 'login', 'error'],
    required: true,
  },
  data: {
    query: String,
    intent: String,
    confidence: Number,
    sourceCount: Number,
    responseTime: Number,
    cacheHit: Boolean,
    userId: Schema.Types.ObjectId,
    conversationId: Schema.Types.ObjectId,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// TTL index - auto-delete after 90 days
analyticsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound indexes for queries
analyticsSchema.index({ workspaceId: 1, eventType: 1, timestamp: -1 });

export const Analytics = model('Analytics', analyticsSchema);
```

## Model Relationships

```
User ─────────────────┬─────────────────────────────────────────┐
                      │                                         │
                      ▼                                         │
           NotionWorkspace ◀──── DocumentSource                │
                │                     │                         │
                │                     ▼                         │
                ▼                 [Qdrant]                      │
           Conversation ◀───────────────────────────────────────┘
                │
                ▼
            Message
                │
                ▼
           Analytics
```

## Tenant Isolation Plugin

All models with `workspaceId` use the tenant isolation plugin:

```javascript
// Apply to schema
documentSourceSchema.plugin(tenantIsolationPlugin);
conversationSchema.plugin(tenantIsolationPlugin);
messageSchema.plugin(tenantIsolationPlugin);
```

This automatically filters queries by `workspaceId` from the current tenant context.
