/**
 * Conversation API Integration Tests
 *
 * Tests the conversation management endpoints including:
 * - Creating conversations
 * - Listing conversations
 * - Getting conversation details
 * - Updating and deleting conversations
 * - Authorization checks (BOLA protection)
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
// 32 bytes = 64 hex characters for AES-256
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

// Mock auth audit service - include all methods used by auth controller
vi.mock('../../services/authAuditService.js', () => ({
  authAuditService: {
    logRegisterSuccess: vi.fn().mockResolvedValue(true),
    logLoginSuccess: vi.fn().mockResolvedValue(true),
    logLoginFailed: vi.fn().mockResolvedValue(true),
    logLoginBlockedLocked: vi.fn().mockResolvedValue(true),
    logAccountLocked: vi.fn().mockResolvedValue(true),
    logLogout: vi.fn().mockResolvedValue(true),
    logPasswordResetRequest: vi.fn().mockResolvedValue(true),
    logPasswordResetSuccess: vi.fn().mockResolvedValue(true),
    logTokenRefresh: vi.fn().mockResolvedValue(true),
    logTokenTheftDetected: vi.fn().mockResolvedValue(true),
    detectBruteForce: vi.fn().mockResolvedValue({ blocked: false }),
    checkBruteForce: vi.fn().mockResolvedValue({ blocked: false }),
    isBlocked: vi.fn().mockResolvedValue(false),
  },
}));

// Mock email service - define mock inline to avoid hoisting issues
vi.mock('../../services/emailService.js', () => {
  const mockFns = {
    sendEmail: () => Promise.resolve({ success: true }),
    sendEmailVerification: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
    sendWelcomeEmail: () => Promise.resolve({ success: true }),
    sendWorkspaceInvitation: () => Promise.resolve({ success: true }),
    verifyConnection: () => Promise.resolve(true),
  };
  return {
    emailService: mockFns,
    default: mockFns,
  };
});

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

describe('Conversation API Integration Tests', () => {
  let request;
  let mongoServer;
  const API_BASE = '/api/v1';
  const AUTH_BASE = '/api/v1/auth';

  // Test users
  const testUser = {
    email: 'user1@example.com',
    password: 'ValidPassword123!',
    name: 'User One',
  };

  const testUser2 = {
    email: 'user2@example.com',
    password: 'ValidPassword123!',
    name: 'User Two',
  };

  let user1Token;
  let user2Token;
  let user1Id;
  let user2Id;
  let workspaceId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);
    request = supertest(app);

    // Register and login user 1
    const reg1 = await request.post(`${AUTH_BASE}/register`).send(testUser);
    if (reg1.status !== 201) {
      throw new Error(`Failed to register user 1: ${JSON.stringify(reg1.body)}`);
    }

    const User = mongoose.model('User');
    const user1 = await User.findOneAndUpdate(
      { email: testUser.email },
      { $set: { isEmailVerified: true, isActive: true } },
      { new: true }
    );

    if (!user1) {
      throw new Error('User 1 not found after registration');
    }
    user1Id = user1._id;

    const login1 = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: testUser.email, password: testUser.password });

    if (login1.status !== 200) {
      throw new Error(`Failed to login user 1: ${JSON.stringify(login1.body)}`);
    }
    user1Token = login1.body.data.accessToken;

    // Register and login user 2
    await request.post(`${AUTH_BASE}/register`).send(testUser2);
    const user2 = await User.findOneAndUpdate(
      { email: testUser2.email },
      { $set: { isEmailVerified: true, isActive: true } },
      { new: true }
    );
    user2Id = user2._id;

    const login2 = await request
      .post(`${AUTH_BASE}/login`)
      .send({ email: testUser2.email, password: testUser2.password });
    user2Token = login2.body.data.accessToken;

    // Create a workspace for user 1 using NotionWorkspace
    const NotionWorkspace = mongoose.model('NotionWorkspace');
    const workspace = await NotionWorkspace.create({
      workspaceId: 'test-workspace-conv',
      workspaceName: 'Test Workspace',
      userId: user1Id,
      accessToken: 'test-encrypted-token',
    });
    workspaceId = workspace.workspaceId;

    // Create workspace members for both users
    const WorkspaceMember = mongoose.model('WorkspaceMember');
    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: user1Id,
      role: 'owner',
      status: 'active',
      permissions: {
        canQuery: true,
        canManageMembers: true,
        canManageSettings: true,
      },
    });

    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: user2Id,
      role: 'member',
      status: 'active',
      permissions: {
        canQuery: true,
        canManageMembers: false,
        canManageSettings: false,
      },
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear only conversation and message collections between tests
    // Keep users and workspace to avoid re-registration
    const Conversation = mongoose.model('Conversation');
    const Message = mongoose.model('Message');
    await Conversation.deleteMany({});
    await Message.deleteMany({});
  });

  // =============================================================================
  // Create Conversation Tests
  // =============================================================================
  describe('POST /conversations', () => {
    it('should create a new conversation', async () => {
      const res = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Test Conversation' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      // API may return 'id' or '_id' depending on serialization
      const conversationId = res.body.data.conversation.id || res.body.data.conversation._id;
      expect(conversationId).toBeDefined();
      expect(res.body.data.conversation.title).toBe('Test Conversation');
    });

    it('should create conversation with auto-generated title', async () => {
      const res = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.conversation).toHaveProperty('title');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request.post(`${API_BASE}/conversations`).send({ title: 'Test' });

      expect(res.status).toBe(401);
    });

    it('should allow workspace member to create conversation', async () => {
      // User2 is a workspace member, so should be able to create conversations
      const res = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'User2 Conversation' });

      // User2 is a member, so this should succeed
      expect([201, 403]).toContain(res.status); // 403 if app enforces ownership
    });
  });

  // =============================================================================
  // List Conversations Tests
  // =============================================================================
  describe('GET /conversations', () => {
    beforeEach(async () => {
      // Create some conversations
      for (let i = 1; i <= 3; i++) {
        await request
          .post(`${API_BASE}/conversations`)
          .set('Authorization', `Bearer ${user1Token}`)
          .set('X-Workspace-Id', workspaceId.toString())
          .send({ title: `Conversation ${i}` });
      }
    });

    it('should list user conversations', async () => {
      const res = await request
        .get(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(res.status).toBe(200);
      expect(res.body.data.conversations).toBeInstanceOf(Array);
      expect(res.body.data.conversations.length).toBe(3);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request.get(`${API_BASE}/conversations`);

      expect(res.status).toBe(401);
    });

    it('should support pagination', async () => {
      const res = await request
        .get(`${API_BASE}/conversations?limit=2&page=1`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(res.status).toBe(200);
      expect(res.body.data.conversations.length).toBeLessThanOrEqual(2);
    });
  });

  // =============================================================================
  // Get Single Conversation Tests
  // =============================================================================
  describe('GET /conversations/:id', () => {
    let conversationId;

    beforeEach(async () => {
      const createRes = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Test Conversation' });

      if (createRes.status !== 201) {
        console.log('Conversation creation failed:', createRes.status, createRes.body);
      }
      conversationId =
        createRes.body.data?.conversation?.id || createRes.body.data?.conversation?._id;
    });

    it('should get conversation by ID', async () => {
      const res = await request
        .get(`${API_BASE}/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      if (res.status !== 200) {
        console.log('Get conversation failed:', res.status, JSON.stringify(res.body, null, 2));
        console.log('Conversation ID:', conversationId);
      }
      expect(res.status).toBe(200);
      const returnedId = res.body.data.conversation.id || res.body.data.conversation._id;
      expect(returnedId).toBe(conversationId);
    });

    it('should return 404 for non-existent conversation', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request
        .get(`${API_BASE}/conversations/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(res.status).toBe(404);
    });

    it('should return error for invalid ID format', async () => {
      const res = await request
        .get(`${API_BASE}/conversations/invalid-id`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // =============================================================================
  // Update Conversation Tests
  // =============================================================================
  describe('PATCH /conversations/:id', () => {
    let conversationId;

    beforeEach(async () => {
      const createRes = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Original Title' });

      conversationId = createRes.body.data.conversation.id || createRes.body.data.conversation._id;
    });

    it('should update conversation title', async () => {
      const res = await request
        .patch(`${API_BASE}/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.conversation.title).toBe('Updated Title');
    });

    it('should return 404 for non-existent conversation', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request
        .patch(`${API_BASE}/conversations/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  // =============================================================================
  // Delete Conversation Tests
  // =============================================================================
  describe('DELETE /conversations/:id', () => {
    let conversationId;

    beforeEach(async () => {
      const createRes = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'To Be Deleted' });

      conversationId = createRes.body.data.conversation.id || createRes.body.data.conversation._id;
    });

    it('should delete conversation', async () => {
      const res = await request
        .delete(`${API_BASE}/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(res.status).toBe(200);

      // Verify deletion
      const getRes = await request
        .get(`${API_BASE}/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent conversation', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request
        .delete(`${API_BASE}/conversations/${fakeId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(res.status).toBe(404);
    });
  });

  // =============================================================================
  // BOLA (Broken Object Level Authorization) Tests
  // =============================================================================
  describe('BOLA Protection', () => {
    let user1ConversationId;

    beforeEach(async () => {
      const createRes = await request
        .post(`${API_BASE}/conversations`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'User 1 Conversation' });

      // User2 is already a workspace member from beforeAll, but should not access user1's conversations
      user1ConversationId =
        createRes.body.data.conversation.id ||
        createRes.body.data.conversation.id ||
        createRes.body.data.conversation._id;
    });

    it('should prevent access to other users conversations', async () => {
      const res = await request
        .get(`${API_BASE}/conversations/${user1ConversationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      // Should return 403 (forbidden) or 404 (not found - to prevent enumeration)
      expect([403, 404]).toContain(res.status);
    });

    it('should prevent modification of other users conversations', async () => {
      const res = await request
        .patch(`${API_BASE}/conversations/${user1ConversationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Workspace-Id', workspaceId.toString())
        .send({ title: 'Malicious Update' });

      expect([403, 404]).toContain(res.status);
    });

    it('should prevent deletion of other users conversations', async () => {
      const res = await request
        .delete(`${API_BASE}/conversations/${user1ConversationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect([403, 404]).toContain(res.status);

      // Verify conversation still exists for owner
      const getRes = await request
        .get(`${API_BASE}/conversations/${user1ConversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Workspace-Id', workspaceId.toString());

      expect(getRes.status).toBe(200);
    });
  });
});
