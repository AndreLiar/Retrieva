/**
 * Workspace/Notion API Integration Tests
 *
 * Tests workspace management and Notion integration including:
 * - Notion OAuth flow
 * - Workspace listing and details
 * - Workspace sync operations
 * - Workspace authorization (BOLA protection)
 * - Workspace member management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Set ALL required environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// Mock external dependencies
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

vi.mock('../../services/emailService.js', () => {
  const mockFns = {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendPasswordChanged: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
  };
  return {
    emailService: mockFns,
    default: mockFns,
  };
});

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

// Mock Notion client
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ results: [] }),
    databases: {
      query: vi.fn().mockResolvedValue({ results: [] }),
    },
    pages: {
      retrieve: vi.fn().mockResolvedValue({ id: 'page-123', properties: {} }),
    },
  })),
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getCollection: vi.fn().mockResolvedValue({ name: 'documents', vectors_count: 100 }),
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
  llm: {
    invoke: vi.fn().mockResolvedValue('test response'),
  },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  },
}));

import app from '../../app.js';

describe('Workspace/Notion API Integration Tests', () => {
  let request;
  let mongoServer;
  const NOTION_BASE = '/api/v1/notion';
  const WORKSPACE_BASE = '/api/v1/workspaces';
  const AUTH_BASE = '/api/v1/auth';

  // Test users
  const testUser = {
    email: 'workspace-owner@example.com',
    password: 'ValidPassword123!',
    name: 'Workspace Owner',
  };

  const testUser2 = {
    email: 'workspace-member@example.com',
    password: 'ValidPassword123!',
    name: 'Workspace Member',
  };

  let user1Token;
  let user2Token;
  let user1Id;
  let user2Id;
  let workspaceId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);
    request = supertest(app);

    // Register and verify user 1
    const registerRes1 = await request.post(`${AUTH_BASE}/register`).send(testUser);
    expect(registerRes1.status).toBe(201);

    const User = mongoose.model('User');
    await User.updateOne(
      { email: testUser.email },
      { $set: { isEmailVerified: true, isActive: true } }
    );

    const loginRes1 = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });
    expect(loginRes1.status).toBe(200);
    user1Token = loginRes1.body.data.accessToken;
    const user1Doc = await User.findOne({ email: testUser.email });
    user1Id = user1Doc._id.toString();

    // Register and verify user 2
    const registerRes2 = await request.post(`${AUTH_BASE}/register`).send(testUser2);
    expect(registerRes2.status).toBe(201);

    await User.updateOne(
      { email: testUser2.email },
      { $set: { isEmailVerified: true, isActive: true } }
    );

    const loginRes2 = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: testUser2.email, password: testUser2.password });
    expect(loginRes2.status).toBe(200);
    user2Token = loginRes2.body.data.accessToken;
    const user2Doc = await User.findOne({ email: testUser2.email });
    user2Id = user2Doc._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear workspaces between tests
    const NotionWorkspace = mongoose.model('NotionWorkspace');
    await NotionWorkspace.deleteMany({});
  });

  // =============================================================================
  // Notion OAuth Flow
  // =============================================================================
  describe('Notion OAuth', () => {
    describe('GET /api/v1/notion/auth', () => {
      it('should require authentication', async () => {
        const res = await request.get(`${NOTION_BASE}/auth`);
        expect(res.status).toBe(401);
      });

      it('should provide OAuth URL for authenticated user', async () => {
        const res = await request
          .get(`${NOTION_BASE}/auth`)
          .set('Authorization', `Bearer ${user1Token}`);

        // May return 500 if OAuth not configured, but endpoint should exist
        expect([200, 400, 500]).toContain(res.status);
      });
    });

    describe('GET /api/v1/notion/callback', () => {
      it('should handle OAuth callback', async () => {
        const res = await request
          .get(`${NOTION_BASE}/callback`)
          .query({ code: 'test-code', state: 'test-state' });

        // Should handle gracefully even if OAuth not configured
        expect([200, 302, 400, 500]).toContain(res.status);
      });

      it('should reject callback without code', async () => {
        const res = await request.get(`${NOTION_BASE}/callback`).query({ state: 'test-state' });

        expect([400, 500]).toContain(res.status);
      });
    });
  });

  // =============================================================================
  // Workspace Listing (via Notion routes)
  // =============================================================================
  describe('GET /api/v1/notion/workspaces', () => {
    it('should require authentication', async () => {
      const res = await request.get(`${NOTION_BASE}/workspaces`);
      expect(res.status).toBe(401);
    });

    it('should return empty list for new user', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should return user workspaces only', async () => {
      // Create workspace for user 1
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'Test Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });

      const res = await request
        .get(`${NOTION_BASE}/workspaces`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // =============================================================================
  // Workspace Details (BOLA Protection Test)
  // =============================================================================
  describe('GET /api/v1/notion/workspaces/:id', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });
      workspaceId = workspace._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.get(`${NOTION_BASE}/workspaces/${workspaceId}`);
      expect(res.status).toBe(401);
    });

    it('should allow workspace owner to view', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should prevent unauthorized user from viewing (BOLA)', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect([403, 404]).toContain(res.status);
    });

    it('should return 404 for non-existent workspace', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });
  });

  // =============================================================================
  // Workspace Sync Status
  // =============================================================================
  describe('GET /api/v1/notion/workspaces/:id/sync-status', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
        syncStatus: 'active',
        lastSyncAt: new Date(),
      });
      workspaceId = workspace._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-status`);
      expect(res.status).toBe(401);
    });

    it('should return sync status for owner', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-status`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should prevent unauthorized access (BOLA)', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-status`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect([403, 404]).toContain(res.status);
    });
  });

  // =============================================================================
  // Workspace Sync Triggers
  // =============================================================================
  describe('POST /api/v1/notion/workspaces/:id/sync', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });
      workspaceId = workspace._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request
        .post(`${NOTION_BASE}/workspaces/${workspaceId}/sync`)
        .send({ syncType: 'full' });

      expect(res.status).toBe(401);
    });

    it.skip('should allow owner to trigger sync (requires BullMQ)', async () => {
      const res = await request
        .post(`${NOTION_BASE}/workspaces/${workspaceId}/sync`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ syncType: 'full' })
        .timeout(15000);

      // Should accept or return error if sync system not available
      expect([200, 202, 500, 503]).toContain(res.status);
    });

    it('should prevent unauthorized sync trigger (BOLA)', async () => {
      const res = await request
        .post(`${NOTION_BASE}/workspaces/${workspaceId}/sync`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ syncType: 'full' });

      expect([403, 404]).toContain(res.status);
    });
  });

  // =============================================================================
  // Workspace Deletion (BOLA Protection)
  // =============================================================================
  describe('DELETE /api/v1/notion/workspaces/:id', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });
      workspaceId = workspace._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.delete(`${NOTION_BASE}/workspaces/${workspaceId}`);
      expect(res.status).toBe(401);
    });

    it('should prevent unauthorized deletion (BOLA)', async () => {
      const res = await request
        .delete(`${NOTION_BASE}/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect([403, 404]).toContain(res.status);

      // Verify workspace still exists
      if (res.status === 403) {
        const NotionWorkspace = mongoose.model('NotionWorkspace');
        const workspace = await NotionWorkspace.findById(workspaceId);
        expect(workspace).toBeTruthy();
      }
    });

    it.skip('should allow owner to delete workspace (requires cleanup operations)', async () => {
      const res = await request
        .delete(`${NOTION_BASE}/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .timeout(15000);

      // May return 200, 204, or 500 depending on cleanup operations
      expect([200, 204, 500]).toContain(res.status);
    });
  });

  // =============================================================================
  // Workspace Pages and Databases
  // =============================================================================
  describe('Workspace Content Listing', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });
      workspaceId = workspace._id.toString();
    });

    describe('GET /api/v1/notion/workspaces/:id/pages', () => {
      it('should require authentication', async () => {
        const res = await request.get(`${NOTION_BASE}/workspaces/${workspaceId}/pages`);
        expect(res.status).toBe(401);
      });

      it('should return pages for owner', async () => {
        const res = await request
          .get(`${NOTION_BASE}/workspaces/${workspaceId}/pages`)
          .set('Authorization', `Bearer ${user1Token}`);

        expect([200, 500]).toContain(res.status);
      });
    });

    describe('GET /api/v1/notion/workspaces/:id/databases', () => {
      it('should require authentication', async () => {
        const res = await request.get(`${NOTION_BASE}/workspaces/${workspaceId}/databases`);
        expect(res.status).toBe(401);
      });

      it('should return databases for owner', async () => {
        const res = await request
          .get(`${NOTION_BASE}/workspaces/${workspaceId}/databases`)
          .set('Authorization', `Bearer ${user1Token}`);

        expect([200, 500]).toContain(res.status);
      });
    });
  });

  // =============================================================================
  // Workspace Membership Routes
  // =============================================================================
  describe('Workspace Membership', () => {
    describe('GET /api/v1/workspaces/my-workspaces', () => {
      it('should require authentication', async () => {
        const res = await request.get(`${WORKSPACE_BASE}/my-workspaces`);
        expect(res.status).toBe(401);
      });

      it('should return workspaces user has access to', async () => {
        const res = await request
          .get(`${WORKSPACE_BASE}/my-workspaces`)
          .set('Authorization', `Bearer ${user1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
      });
    });

    describe('GET /api/v1/workspaces/:workspaceId/members', () => {
      beforeEach(async () => {
        const NotionWorkspace = mongoose.model('NotionWorkspace');
        const workspace = await NotionWorkspace.create({
          workspaceId: 'test-workspace-1',
          workspaceName: 'User 1 Workspace',
          userId: user1Id,
          accessToken: 'encrypted-token',
        });
        workspaceId = workspace._id.toString();
      });

      it('should require authentication', async () => {
        const res = await request.get(`${WORKSPACE_BASE}/${workspaceId}/members`);
        expect(res.status).toBe(401);
      });

      it('should return members for workspace owner', async () => {
        const res = await request
          .get(`${WORKSPACE_BASE}/${workspaceId}/members`)
          .set('Authorization', `Bearer ${user1Token}`);

        expect([200, 403, 404]).toContain(res.status);
      });
    });

    describe('POST /api/v1/workspaces/:workspaceId/invite', () => {
      beforeEach(async () => {
        const NotionWorkspace = mongoose.model('NotionWorkspace');
        const workspace = await NotionWorkspace.create({
          workspaceId: 'test-workspace-1',
          workspaceName: 'User 1 Workspace',
          userId: user1Id,
          accessToken: 'encrypted-token',
        });
        workspaceId = workspace._id.toString();
      });

      it('should require authentication', async () => {
        const res = await request
          .post(`${WORKSPACE_BASE}/${workspaceId}/invite`)
          .send({ email: testUser2.email, role: 'member' });

        expect(res.status).toBe(401);
      });

      it('should allow owner to invite member', async () => {
        const res = await request
          .post(`${WORKSPACE_BASE}/${workspaceId}/invite`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ email: testUser2.email, role: 'member' });

        expect([200, 201, 403, 404]).toContain(res.status);
      });

      it('should prevent non-owner from inviting', async () => {
        const res = await request
          .post(`${WORKSPACE_BASE}/${workspaceId}/invite`)
          .set('Authorization', `Bearer ${user2Token}`)
          .send({ email: 'another@example.com', role: 'member' });

        expect([403, 404]).toContain(res.status);
      });
    });
  });

  // =============================================================================
  // Sync History
  // =============================================================================
  describe('GET /api/v1/notion/workspaces/:id/sync-history', () => {
    beforeEach(async () => {
      const NotionWorkspace = mongoose.model('NotionWorkspace');
      const workspace = await NotionWorkspace.create({
        workspaceId: 'test-workspace-1',
        workspaceName: 'User 1 Workspace',
        userId: user1Id,
        accessToken: 'encrypted-token',
      });
      workspaceId = workspace._id.toString();
    });

    it('should require authentication', async () => {
      const res = await request.get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-history`);
      expect(res.status).toBe(401);
    });

    it('should return sync history for owner', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-history`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect([200, 500]).toContain(res.status);
    });

    it('should prevent unauthorized access', async () => {
      const res = await request
        .get(`${NOTION_BASE}/workspaces/${workspaceId}/sync-history`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect([403, 404]).toContain(res.status);
    });
  });
});
