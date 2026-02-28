/**
 * Integration Tests — Risk Decision & Clause Sign-off endpoints
 *
 *  PATCH /api/v1/assessments/:id/risk-decision
 *  PATCH /api/v1/assessments/:id/clause-signoff
 *
 * Uses MongoMemoryServer + real auth/workspace middleware.
 * All external services (Qdrant, queue, email) are mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// ---------------------------------------------------------------------------
// External service mocks
// ---------------------------------------------------------------------------

vi.mock('../../config/redis.js', () => ({
  redisConnection: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    stream: { write: vi.fn() },
  },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendPasswordChanged: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
    sendOrganizationInvitation: () => Promise.resolve({ success: true }),
  },
  default: {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendPasswordChanged: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
    sendOrganizationInvitation: () => Promise.resolve({ success: true }),
  },
}));

vi.mock('../../services/authAuditService.js', () => ({
  authAuditService: {
    logRegisterSuccess: vi.fn().mockResolvedValue(true),
    logLoginSuccess: vi.fn().mockResolvedValue(true),
    logLoginFailed: vi.fn().mockResolvedValue(true),
    logLoginBlockedLocked: vi.fn().mockResolvedValue(true),
    logAccountLocked: vi.fn().mockResolvedValue(true),
    detectBruteForce: vi.fn().mockResolvedValue({ blocked: false }),
    logPasswordResetRequest: vi.fn().mockResolvedValue(true),
    logPasswordResetSuccess: vi.fn().mockResolvedValue(true),
    logLogout: vi.fn().mockResolvedValue(true),
    logTokenRefresh: vi.fn().mockResolvedValue(true),
    logEmailVerified: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../config/queue.js', () => ({
  assessmentQueue: { add: vi.fn().mockResolvedValue({ id: 'j1' }), on: vi.fn() },
  notionSyncQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
  documentIndexQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
  memoryDecayQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
  monitoringQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
}));

vi.mock('../../services/fileIngestionService.js', () => ({
  ingestFile: vi.fn().mockResolvedValue({ chunkCount: 5, collectionName: 'col' }),
  deleteAssessmentCollection: vi.fn().mockResolvedValue(undefined),
  assessmentCollectionName: vi.fn((id) => `assessment_${id}`),
  chunkText: vi.fn().mockReturnValue(['c1', 'c2']),
  parseFile: vi.fn().mockResolvedValue('text'),
  searchAssessmentChunks: vi.fn().mockResolvedValue([]),
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 0 }),
    createCollection: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([]),
    deleteCollection: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../config/vectorStore.js', () => ({
  getVectorStore: vi
    .fn()
    .mockResolvedValue({ client: { getCollection: vi.fn().mockResolvedValue({}) } }),
}));

vi.mock('../../config/llm.js', () => ({
  llm: { invoke: vi.fn().mockResolvedValue('test') },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  },
}));

vi.mock('@notionhq/client', () => ({
  Client: vi
    .fn()
    .mockImplementation(() => ({ search: vi.fn().mockResolvedValue({ results: [] }) })),
}));

// ---------------------------------------------------------------------------
// App (AFTER mocks)
// ---------------------------------------------------------------------------

import app from '../../app.js';

const AUTH_BASE = '/api/v1/auth';
const ASSESSMENT_BASE = '/api/v1/assessments';

const makePdfBuffer = () =>
  Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>');

async function createAndLoginUser(request, userData) {
  await request.post(`${AUTH_BASE}/register`).send(userData);
  const User = mongoose.model('User');
  await User.updateOne(
    { email: userData.email },
    { $set: { isEmailVerified: true, isActive: true } }
  );
  const loginRes = await request
    .post(`${AUTH_BASE}/login`)
    .send({ email: userData.email, password: userData.password });
  const userDoc = await User.findOne({ email: userData.email });
  return { token: loginRes.body.data.accessToken, userId: userDoc._id.toString() };
}

async function createWorkspaceForUser(userId) {
  const Workspace = mongoose.model('Workspace');
  const WorkspaceMember = mongoose.model('WorkspaceMember');
  const workspace = await Workspace.create({ name: 'Risk WS', syncStatus: 'synced', userId });
  await WorkspaceMember.create({
    workspaceId: workspace._id,
    userId,
    role: 'owner',
    status: 'active',
    permissions: { canQuery: true, canManage: true, canInvite: true },
  });
  return workspace._id.toString();
}

async function createCompleteAssessment(request, token, workspaceId, framework = 'DORA') {
  const res = await request
    .post(ASSESSMENT_BASE)
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Q1 Test')
    .field('vendorName', 'Acme Corp')
    .field('workspaceId', workspaceId)
    .field('framework', framework)
    .attach('files', makePdfBuffer(), { filename: 'policy.pdf', contentType: 'application/pdf' });
  return res.body.data.assessment._id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Risk Decision & Clause Sign-off Integration Tests', () => {
  let request;
  let mongoServer;
  let user1Token;
  let user1Id;
  let user2Token;
  let workspaceId;

  const user1 = { email: 'rd-user1@example.com', password: 'ValidPassword123!', name: 'RD User1' };
  const user2 = { email: 'rd-user2@example.com', password: 'ValidPassword123!', name: 'RD User2' };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;
    await mongoose.connect(mongoUri);

    request = supertest(app);
    const u1 = await createAndLoginUser(request, user1);
    user1Token = u1.token;
    user1Id = u1.userId;

    const u2 = await createAndLoginUser(request, user2);
    user2Token = u2.token;

    workspaceId = await createWorkspaceForUser(user1Id);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.model('Assessment').deleteMany({});
    vi.clearAllMocks();
  });

  // ==========================================================================
  // PATCH /assessments/:id/risk-decision
  // ==========================================================================

  describe('PATCH /assessments/:id/risk-decision', () => {
    it('requires authentication', async () => {
      const res = await request
        .patch(`${ASSESSMENT_BASE}/000000000000000000000001/risk-decision`)
        .send({ decision: 'proceed' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid decision value', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent assessment', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${fakeId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'proceed' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when user has no access to assessment workspace', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ decision: 'proceed' });
      expect(res.status).toBe(403);
    });

    it('records proceed decision and returns 200', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'proceed', rationale: 'All controls verified' });

      expect(res.status).toBe(200);
      expect(res.body.data.riskDecision.decision).toBe('proceed');
      expect(res.body.data.riskDecision.rationale).toBe('All controls verified');
    });

    it('records reject decision', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'reject', rationale: 'Too risky' });
      expect(res.status).toBe(200);
      expect(res.body.data.riskDecision.decision).toBe('reject');
    });

    it('records conditional decision', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'conditional' });
      expect(res.status).toBe(200);
      expect(res.body.data.riskDecision.decision).toBe('conditional');
    });

    it('overwrites a previous decision when called again', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'proceed' });

      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'reject', rationale: 'Changed mind' });

      expect(res.status).toBe(200);
      expect(res.body.data.riskDecision.decision).toBe('reject');
    });

    it('persists the decision so GET /assessments/:id returns it', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId);
      await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/risk-decision`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ decision: 'conditional', rationale: 'Subject to cert renewal' });

      const getRes = await request
        .get(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.assessment.riskDecision.decision).toBe('conditional');
    });
  });

  // ==========================================================================
  // PATCH /assessments/:id/clause-signoff
  // ==========================================================================

  describe('PATCH /assessments/:id/clause-signoff', () => {
    it('requires authentication', async () => {
      const res = await request
        .patch(`${ASSESSMENT_BASE}/000000000000000000000001/clause-signoff`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when clauseRef is missing', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ status: 'accepted' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'approved' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when assessment is not CONTRACT_A30 framework', async () => {
      const assessmentId = await createCompleteAssessment(request, user1Token, workspaceId, 'DORA');
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/CONTRACT_A30/);
    });

    it('returns 403 when user has no access to workspace', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted' });
      expect(res.status).toBe(403);
    });

    it('adds a new clause signoff and returns 200', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted', note: 'Verified by legal' });

      expect(res.status).toBe(200);
      const signoffs = res.body.data.clauseSignoffs;
      expect(signoffs).toHaveLength(1);
      expect(signoffs[0].clauseRef).toBe('Art.30(1)');
      expect(signoffs[0].status).toBe('accepted');
      expect(signoffs[0].note).toBe('Verified by legal');
    });

    it('accepts waived status', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );
      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(2)', status: 'waived' });
      expect(res.status).toBe(200);
      expect(res.body.data.clauseSignoffs[0].status).toBe('waived');
    });

    it('upserts: calling again for same clauseRef replaces the previous signoff', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );

      await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'rejected', note: 'initial' });

      const res = await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted', note: 'updated after negotiation' });

      expect(res.status).toBe(200);
      const signoffs = res.body.data.clauseSignoffs;
      // Must still be exactly 1 signoff for Art.30(1)
      const art30 = signoffs.filter((s) => s.clauseRef === 'Art.30(1)');
      expect(art30).toHaveLength(1);
      expect(art30[0].status).toBe('accepted');
      expect(art30[0].note).toBe('updated after negotiation');
    });

    it('accumulates multiple distinct clause signoffs', async () => {
      const assessmentId = await createCompleteAssessment(
        request,
        user1Token,
        workspaceId,
        'CONTRACT_A30'
      );

      await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(1)', status: 'accepted' });

      await request
        .patch(`${ASSESSMENT_BASE}/${assessmentId}/clause-signoff`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ clauseRef: 'Art.30(2)', status: 'waived' });

      const getRes = await request
        .get(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      const signoffs = getRes.body.data.assessment.clauseSignoffs;
      expect(signoffs).toHaveLength(2);
      expect(signoffs.map((s) => s.clauseRef).sort()).toEqual(['Art.30(1)', 'Art.30(2)']);
    });
  });
});
