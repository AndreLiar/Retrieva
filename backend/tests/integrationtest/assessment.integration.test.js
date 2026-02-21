/**
 * Assessment API Integration Tests
 *
 * Tests all assessment REST endpoints with real MongoDB (MongoMemoryServer),
 * real auth/workspace middleware, and mocked external services (Qdrant, queue, embeddings).
 *
 * Endpoints under test:
 *  POST   /api/v1/assessments
 *  GET    /api/v1/assessments
 *  GET    /api/v1/assessments/:id
 *  DELETE /api/v1/assessments/:id
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';

// ---------------------------------------------------------------------------
// Environment must be set BEFORE any imports that read process.env
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// ---------------------------------------------------------------------------
// Mock all external / side-effecting dependencies
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
  },
  default: {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendPasswordChanged: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
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

// Assessment queue — prevents BullMQ from connecting to Redis
vi.mock('../../config/queue.js', () => ({
  assessmentQueue: {
    add: vi.fn().mockResolvedValue({ id: 'test-job-1' }),
    on: vi.fn(),
  },
  notionSyncQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
  documentIndexQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
  memoryDecayQueue: { add: vi.fn().mockResolvedValue({}), on: vi.fn() },
}));

// File ingestion service — prevents Qdrant connections
vi.mock('../../services/fileIngestionService.js', () => ({
  ingestFile: vi.fn().mockResolvedValue({ chunkCount: 5, collectionName: 'assessment_test' }),
  deleteAssessmentCollection: vi.fn().mockResolvedValue(undefined),
  assessmentCollectionName: vi.fn((id) => `assessment_${id}`),
  chunkText: vi.fn().mockReturnValue(['chunk1', 'chunk2']),
  parseFile: vi.fn().mockResolvedValue('parsed text content'),
  searchAssessmentChunks: vi.fn().mockResolvedValue([]),
}));

// Qdrant
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
    createCollection: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([]),
    deleteCollection: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../config/vectorStore.js', () => ({
  getVectorStore: vi.fn().mockResolvedValue({
    client: {
      getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
    },
  }),
}));

vi.mock('../../config/llm.js', () => ({
  llm: { invoke: vi.fn().mockResolvedValue('test response') },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  },
}));

// Notion client
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ results: [] }),
  })),
}));

// ---------------------------------------------------------------------------
// App import (AFTER all mocks)
// ---------------------------------------------------------------------------
import app from '../../app.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_BASE = '/api/v1/auth';
const ASSESSMENT_BASE = '/api/v1/assessments';

/** Create a minimal valid PDF buffer for file uploads */
const makePdfBuffer = () =>
  Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>');

/** Register + verify + login a user, return the access token and userId */
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
  return {
    token: loginRes.body.data.accessToken,
    userId: userDoc._id.toString(),
  };
}

/** Create a WorkspaceMember + NotionWorkspace for a user, return workspaceId */
async function createWorkspaceForUser(userId) {
  const NotionWorkspace = mongoose.model('NotionWorkspace');
  const WorkspaceMember = mongoose.model('WorkspaceMember');

  const workspace = await NotionWorkspace.create({
    workspaceId: `ws-${userId}`,
    workspaceName: `Test Workspace`,
    accessToken: 'encrypted_token',
    syncStatus: 'active',
    userId,
  });

  await WorkspaceMember.create({
    workspaceId: workspace._id,
    userId,
    role: 'owner',
    status: 'active',
    permissions: {
      canQuery: true,
      canManage: true,
      canInvite: true,
    },
  });

  return workspace._id.toString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessment API Integration Tests', () => {
  let request;
  let mongoServer;
  let user1Token;
  let user1Id;
  let user2Token;
  let user2Id;
  let workspaceId;

  const user1 = {
    email: 'assessment-user1@example.com',
    password: 'ValidPassword123!',
    name: 'Assessment User 1',
  };

  const user2 = {
    email: 'assessment-user2@example.com',
    password: 'ValidPassword123!',
    name: 'Assessment User 2',
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;
    await mongoose.connect(mongoUri);

    request = supertest(app);

    // Create users
    const u1 = await createAndLoginUser(request, user1);
    user1Token = u1.token;
    user1Id = u1.userId;

    const u2 = await createAndLoginUser(request, user2);
    user2Token = u2.token;
    user2Id = u2.userId;

    // Create workspace for user1
    workspaceId = await createWorkspaceForUser(user1Id);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear assessments between tests to keep them isolated
    const Assessment = mongoose.model('Assessment');
    await Assessment.deleteMany({});
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Authentication and authorization
  // ==========================================================================

  describe('Authentication', () => {
    it('POST /assessments requires authentication', async () => {
      const res = await request.post(ASSESSMENT_BASE).field('name', 'Test');
      expect(res.status).toBe(401);
    });

    it('GET /assessments requires authentication', async () => {
      const res = await request.get(ASSESSMENT_BASE);
      expect(res.status).toBe(401);
    });

    it('GET /assessments/:id requires authentication', async () => {
      const res = await request.get(`${ASSESSMENT_BASE}/507f1f77bcf86cd799439011`);
      expect(res.status).toBe(401);
    });

    it('DELETE /assessments/:id requires authentication', async () => {
      const res = await request.delete(`${ASSESSMENT_BASE}/507f1f77bcf86cd799439011`);
      expect(res.status).toBe(401);
    });
  });

  describe('Workspace access', () => {
    it('GET /assessments returns 403 for user without workspace', async () => {
      // user2 has no workspace membership
      const res = await request.get(ASSESSMENT_BASE).set('Authorization', `Bearer ${user2Token}`);
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // POST /api/v1/assessments
  // ==========================================================================

  describe('POST /assessments', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('vendorName', 'Acme Corp')
        .field('workspaceId', workspaceId)
        .attach('files', makePdfBuffer(), {
          filename: 'policy.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when vendorName is missing', async () => {
      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'My Assessment')
        .field('workspaceId', workspaceId)
        .attach('files', makePdfBuffer(), {
          filename: 'policy.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when workspaceId is missing', async () => {
      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'My Assessment')
        .field('vendorName', 'Acme Corp')
        .attach('files', makePdfBuffer(), {
          filename: 'policy.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when no file is uploaded', async () => {
      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'My Assessment')
        .field('vendorName', 'Acme Corp')
        .field('workspaceId', workspaceId);

      expect(res.status).toBe(400);
    });

    it('creates an assessment and returns 201 with valid payload', async () => {
      const { assessmentQueue } = await import('../../config/queue.js');
      assessmentQueue.add.mockResolvedValue({ id: 'job-1' });

      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'Q1 DORA Assessment')
        .field('vendorName', 'Acme Corp')
        .field('workspaceId', workspaceId)
        .attach('files', makePdfBuffer(), {
          filename: 'policy.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.assessment).toBeDefined();
      expect(res.body.data.assessment.name).toBe('Q1 DORA Assessment');
      expect(res.body.data.assessment.vendorName).toBe('Acme Corp');
      expect(res.body.data.assessment.status).toBe('pending');
    });

    it('creates assessment with correct document metadata', async () => {
      const { assessmentQueue } = await import('../../config/queue.js');
      assessmentQueue.add.mockResolvedValue({ id: 'job-2' });

      const res = await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'Doc Metadata Test')
        .field('vendorName', 'Vendor X')
        .field('workspaceId', workspaceId)
        .attach('files', makePdfBuffer(), {
          filename: 'contract.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      const { documents } = res.body.data.assessment;
      expect(documents).toHaveLength(1);
      expect(documents[0].fileName).toBe('contract.pdf');
      expect(documents[0].fileType).toBe('pdf');
      expect(documents[0].status).toBe('uploading');
    });

    it('enqueues fileIndex and gapAnalysis jobs', async () => {
      const { assessmentQueue } = await import('../../config/queue.js');
      assessmentQueue.add.mockResolvedValue({ id: 'job-3' });

      await request
        .post(ASSESSMENT_BASE)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('name', 'Queue Test')
        .field('vendorName', 'Vendor Y')
        .field('workspaceId', workspaceId)
        .attach('files', makePdfBuffer(), { filename: 'doc.pdf', contentType: 'application/pdf' });

      // One fileIndex job per file + one gapAnalysis job
      const calls = assessmentQueue.add.mock.calls;
      const jobTypes = calls.map((c) => c[0]);
      expect(jobTypes).toContain('fileIndex');
      expect(jobTypes).toContain('gapAnalysis');
    });
  });

  // ==========================================================================
  // GET /api/v1/assessments
  // ==========================================================================

  describe('GET /assessments', () => {
    let createdAssessmentId;

    beforeEach(async () => {
      // Seed one assessment directly in the DB
      const Assessment = mongoose.model('Assessment');
      const doc = await Assessment.create({
        workspaceId,
        name: 'Seeded Assessment',
        vendorName: 'Seed Vendor',
        framework: 'DORA',
        status: 'pending',
        createdBy: user1Id,
        documents: [],
      });
      createdAssessmentId = doc._id.toString();
    });

    it('returns 200 with assessments list for authorized user', async () => {
      const res = await request.get(ASSESSMENT_BASE).set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.assessments).toBeDefined();
      expect(Array.isArray(res.body.data.assessments)).toBe(true);
    });

    it('returns the seeded assessment in the list', async () => {
      const res = await request.get(ASSESSMENT_BASE).set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.assessments.map((a) => a._id);
      expect(ids).toContain(createdAssessmentId);
    });

    it('returns pagination metadata', async () => {
      const res = await request.get(ASSESSMENT_BASE).set('Authorization', `Bearer ${user1Token}`);

      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination).toHaveProperty('page');
      expect(res.body.data.pagination).toHaveProperty('total');
    });

    it('filters by status', async () => {
      const Assessment = mongoose.model('Assessment');
      await Assessment.create({
        workspaceId,
        name: 'Complete Assessment',
        vendorName: 'Done Vendor',
        framework: 'DORA',
        status: 'complete',
        createdBy: user1Id,
        documents: [],
      });

      const res = await request
        .get(`${ASSESSMENT_BASE}?status=complete`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      const statuses = res.body.data.assessments.map((a) => a.status);
      statuses.forEach((s) => expect(s).toBe('complete'));
    });

    it('excludes gap results from list view', async () => {
      const res = await request.get(ASSESSMENT_BASE).set('Authorization', `Bearer ${user1Token}`);

      res.body.data.assessments.forEach((assessment) => {
        // results.gaps should not be present in list view
        if (assessment.results) {
          expect(assessment.results.gaps).toBeUndefined();
        }
      });
    });
  });

  // ==========================================================================
  // GET /api/v1/assessments/:id
  // ==========================================================================

  describe('GET /assessments/:id', () => {
    let assessmentId;

    beforeEach(async () => {
      const Assessment = mongoose.model('Assessment');
      const doc = await Assessment.create({
        workspaceId,
        name: 'Detail Assessment',
        vendorName: 'Detail Vendor',
        framework: 'DORA',
        status: 'complete',
        createdBy: user1Id,
        documents: [],
        results: {
          overallRisk: 'Medium',
          summary: 'Some gaps found.',
          domainsAnalyzed: ['ICT Risk Management'],
          generatedAt: new Date(),
          gaps: [
            {
              article: 'Article 5',
              domain: 'ICT Risk Management',
              requirement: 'Maintain risk framework',
              gapLevel: 'partial',
              vendorCoverage: 'Mentioned briefly',
              recommendation: 'Require formal documentation',
              sourceChunks: [],
            },
          ],
        },
      });
      assessmentId = doc._id.toString();
    });

    it('returns 200 with full assessment detail including gaps', async () => {
      const res = await request
        .get(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.assessment._id).toBe(assessmentId);
      expect(res.body.data.assessment.results).toBeDefined();
      expect(res.body.data.assessment.results.gaps).toBeDefined();
      expect(res.body.data.assessment.results.gaps).toHaveLength(1);
    });

    it('returns 404 for non-existent assessment ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request
        .get(`${ASSESSMENT_BASE}/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when user has no access to the assessment workspace', async () => {
      // Give user2 their own workspace but assessment is in user1's workspace
      await createWorkspaceForUser(user2Id);

      const res = await request
        .get(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/assessments/:id
  // ==========================================================================

  describe('DELETE /assessments/:id', () => {
    let assessmentId;

    beforeEach(async () => {
      const Assessment = mongoose.model('Assessment');
      const doc = await Assessment.create({
        workspaceId,
        name: 'To Delete',
        vendorName: 'Delete Vendor',
        framework: 'DORA',
        status: 'pending',
        createdBy: user1Id,
        documents: [],
      });
      assessmentId = doc._id.toString();
    });

    it('deletes the assessment and returns 200', async () => {
      const res = await request
        .delete(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify it's actually deleted in the DB
      const Assessment = mongoose.model('Assessment');
      const doc = await Assessment.findById(assessmentId);
      expect(doc).toBeNull();
    });

    it('returns 404 for non-existent assessment', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request
        .delete(`${ASSESSMENT_BASE}/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when user is not the creator', async () => {
      // Give user2 access to user1's workspace so they pass workspace auth
      const WorkspaceMember = mongoose.model('WorkspaceMember');
      await WorkspaceMember.create({
        workspaceId,
        userId: user2Id,
        role: 'member',
        status: 'active',
        permissions: { canQuery: true, canManage: false, canInvite: false },
      });

      const res = await request
        .delete(`${ASSESSMENT_BASE}/${assessmentId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });
  });
});
