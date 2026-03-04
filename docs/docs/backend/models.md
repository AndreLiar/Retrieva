---
sidebar_position: 5
---

# Models

Mongoose models define the data schema and provide an interface to MongoDB.

## User Model

```javascript
// models/User.js

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true },  // field-level AES-256-GCM encrypted
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },

  // Multi-device session management (up to 5 active sessions per user)
  refreshTokens: [{
    tokenHash:  { type: String, required: true },  // SHA-256 of raw token
    deviceInfo: { type: String, default: 'unknown' },
    createdAt:  { type: Date, default: Date.now },
    expiresAt:  { type: Date, required: true },
  }],

  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,  // account locks for 2h after 5 failed attempts

  // Email verification
  isEmailVerified:            { type: Boolean, default: false },
  emailVerificationToken:     { type: String, select: false },  // SHA-256 hash
  emailVerificationExpires:   { type: Date, select: false },
  emailVerificationLastSentAt: Date,

  // Password reset
  passwordResetToken:   { type: String, select: false },  // SHA-256 hash
  passwordResetExpires: { type: Date, select: false },

  // Per-channel, per-event notification preferences
  notificationPreferences: {
    inApp: { workspace_invitation: Boolean, sync_completed: Boolean, system_alert: Boolean, /* ... */ },
    email: { workspace_invitation: Boolean, sync_failed: Boolean, system_alert: Boolean, /* ... */ },
  },

  // Organization membership (null for legacy users — falls back to WorkspaceMember)
  organizationId: { type: ObjectId, ref: 'Organization', default: null },
}, { timestamps: true });

// Virtual: account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});
```

**Key methods:**

| Method | Description |
|--------|-------------|
| `comparePassword(candidate)` | bcrypt compare |
| `incLoginAttempts()` | Increment failed logins; locks after 5 |
| `resetLoginAttempts()` | Clear count on successful login |
| `addRefreshToken(hash, device, days)` | Add hashed token (max 5 sessions) |
| `consumeRefreshToken(hash)` | Find + remove token (rotation) |
| `clearAllRefreshTokens()` | Logout all devices |
| `createPasswordResetToken()` | Returns raw token; stores SHA-256 hash |
| `createEmailVerificationToken()` | Returns raw token; stores SHA-256 hash |
| `verifyEmail(rawToken)` | Sets `isEmailVerified = true` |

## Conversation Model

```javascript
// models/Conversation.js

const conversationSchema = new Schema({
  workspaceId: {
    type: Schema.Types.Mixed,  // String or ObjectId — vendor workspace
    index: true,
    default: 'default',
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

## Analytics Model

```javascript
// models/Analytics.js

const analyticsSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
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
     ├──► Assessment ─────────────────────► [Qdrant]
     └──► Conversation ───► Message ─────────► Analytics
```

Users in an org automatically see all workspaces scoped to that org (`Workspace.organizationId`). Legacy users without an `organizationId` fall back to per-workspace `WorkspaceMember` access.

## Tenant Isolation Plugin

All models with `workspaceId` use the tenant isolation plugin:

```javascript
// Apply to schema
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
