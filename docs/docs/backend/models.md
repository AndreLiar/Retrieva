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

## Organization Model

```javascript
// models/Organization.js

const organizationSchema = new Schema({
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  industry: {
    type: String,
    enum: ['insurance', 'banking', 'investment', 'payments', 'other'],
    default: 'other',
  },
  country:  { type: String, maxlength: 100, default: '' },
  ownerId:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const Organization = mongoose.model('Organization', organizationSchema);
```

Represents a company account (e.g. "HDI Global SE"). Every vendor workspace is scoped to one organization via `Workspace.organizationId`.

## OrganizationMember Model

```javascript
// models/OrganizationMember.js

const orgMemberSchema = new Schema({
  organizationId:     { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId:             { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null until invite is accepted
  email:              { type: String, required: true, lowercase: true },
  role:               { type: String, enum: ['org_admin', 'analyst', 'viewer'], default: 'analyst' },
  status:             { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending' },
  inviteTokenHash:    { type: String, select: false },       // SHA-256 of raw invite token
  inviteTokenExpires: { type: Date },                        // 7-day expiry
  invitedBy:          { type: Schema.Types.ObjectId, ref: 'User' },
  joinedAt:           { type: Date },
}, { timestamps: true });

// Unique: one active membership per email per org
orgMemberSchema.index({ organizationId: 1, email: 1 }, { unique: true });
orgMemberSchema.index({ userId: 1 });
```

### Static helpers

| Helper | Description |
|--------|-------------|
| `OrganizationMember.createInvite(orgId, email, role, invitedBy)` | Upserts a pending membership, generates a `crypto.randomBytes(32)` raw token, stores its SHA-256 hash, returns `{ member, rawToken }` |
| `OrganizationMember.findByToken(rawToken)` | Hashes the raw token and finds a non-expired pending membership |
| `OrganizationMember.activate(memberId, userId)` | Sets `status='active'`, records `userId` and `joinedAt`, clears the token hash |

The raw invite token is sent in the email URL (`/join?token=XXX`). Only the hash is stored, following the same pattern as `User.createPasswordResetToken`.

## Model Relationships

```
Organization ◀─── OrganizationMember ───► User
     │                                     │
     │ (organizationId)                    │ (organizationId)
     ▼                                     │
  Workspace ◀──────────────────────────────┘
     │
     ├──► WorkspaceMember  (legacy / per-workspace access)
     ├──► Assessment ─────► DocumentSource ─► [Qdrant]
     └──► Conversation ───► Message ─────────► Analytics
```

Users in an org automatically see all workspaces scoped to that org (`Workspace.organizationId`). Legacy users without an `organizationId` fall back to per-workspace `WorkspaceMember` access.

## Tenant Isolation Plugin

All models with `workspaceId` use the tenant isolation plugin:

```javascript
// Apply to schema
documentSourceSchema.plugin(tenantIsolationPlugin);
conversationSchema.plugin(tenantIsolationPlugin);
messageSchema.plugin(tenantIsolationPlugin);
```

This automatically filters queries by `workspaceId` from the current tenant context.

## Workspace Model

The `Workspace` model represents a vendor in the DORA third-party risk registry.

```javascript
// models/Workspace.js

const certificationSchema = new Schema({
  type:       { type: String, enum: ['ISO27001', 'SOC2', 'CSA-STAR', 'ISO22301'], required: true },
  validUntil: { type: Date, required: true },
  status:     { type: String, enum: ['valid', 'expiring-soon', 'expired'], default: 'valid' },
}, { _id: false });

const workspaceSchema = new Schema({
  name:           { type: String, required: true, maxlength: 100 },
  description:    { type: String, maxlength: 500, default: '' },
  userId:         { type: ObjectId, ref: 'User', required: true },  // creator / primary owner
  syncStatus:     { type: String, enum: ['idle', 'syncing', 'synced', 'error'], default: 'idle' },

  // Vendor profile (DORA Article 28)
  vendorTier:     { type: String, enum: ['critical', 'important', 'standard'], default: null },
  country:        { type: String, maxlength: 100, default: '' },
  serviceType:    { type: String, enum: ['cloud', 'software', 'data', 'network', 'other'], default: null },
  contractStart:  { type: Date, default: null },
  contractEnd:    { type: Date, default: null },
  nextReviewDate: { type: Date, default: null },
  vendorStatus:   { type: String, enum: ['active', 'under-review', 'exited'], default: 'active' },
  certifications: [certificationSchema],
  exitStrategyDoc:{ type: String, default: null },

  // Compliance monitoring deduplication state
  alertsSentAt:   { type: Map, of: Date, default: {} },
}, { timestamps: true });
```

### `alertsSentAt` map

Stores the last time each compliance alert was sent for this workspace. Keys follow the pattern:

| Key | Alert type |
|-----|-----------|
| `cert-expiry-90-<certType>` | 90-day cert expiry warning |
| `cert-expiry-30-<certType>` | 30-day cert expiry warning |
| `cert-expiry-7-<certType>` | 7-day cert expiry warning |
| `contract-renewal-60` | Contract renewal due in 60 days |
| `annual-review-overdue` | Annual review date passed |
| `assessment-overdue-12mo` | No assessment in 12 months |

The monitoring worker checks this map before sending and skips the alert if it was last sent within 20 hours.

### Pre-save hook

Before saving, the hook auto-computes each certification's `status` field:

- `expired` — `validUntil` is in the past
- `expiring-soon` — `validUntil` is within 90 days
- `valid` — otherwise
