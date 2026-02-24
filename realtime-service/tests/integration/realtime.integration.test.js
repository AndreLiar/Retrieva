import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import express from 'express';
import { io as ioc } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { PresenceApplicationService } from '../../src/application/PresenceApplicationService.js';
import { OfflineQueueService } from '../../src/application/OfflineQueueService.js';
import { JwtTokenVerifier } from '../../src/infrastructure/adapters/JwtTokenVerifier.js';
import { createSocketServer } from '../../src/interface/socket/createSocketServer.js';

const TEST_SECRET = 'test-jwt-secret-for-integration-tests-only';

function buildMockPresenceStore(overrides = {}) {
  return {
    setUserPresence: vi.fn().mockResolvedValue(undefined),
    deleteUserPresence: vi.fn().mockResolvedValue(undefined),
    addWorkspaceMember: vi.fn().mockResolvedValue(undefined),
    removeWorkspaceMember: vi.fn().mockResolvedValue(undefined),
    setTypingUser: vi.fn().mockResolvedValue(undefined),
    clearTypingUser: vi.fn().mockResolvedValue(undefined),
    getWorkspaceMembers: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeToken(userId = 'user-test-1', extra = {}) {
  return jwt.sign({ userId, ...extra }, TEST_SECRET, { expiresIn: '1h' });
}

function connectClient(port, token, opts = {}) {
  return ioc(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    ...opts,
  });
}

describe('realtime-service integration', () => {
  let httpServer, io, port;
  let mockPresenceStore;

  beforeAll(async () => {
    mockPresenceStore = buildMockPresenceStore();

    const tokenVerifier = new JwtTokenVerifier(TEST_SECRET);
    const presenceService = new PresenceApplicationService({ presenceStore: mockPresenceStore });
    const offlineQueueService = new OfflineQueueService();

    const app = express();
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    httpServer = http.createServer(app);

    io = createSocketServer(httpServer, {
      frontendUrl: '*',
      tokenVerifier,
      presenceService,
      offlineQueueService,
    });

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('connects successfully with valid JWT', async () => {
    const token = makeToken('user-1');
    const client = connectClient(port, token);

    const connected = await new Promise((resolve, reject) => {
      client.on('connected', (data) => resolve(data));
      client.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    expect(connected.userId).toBe('user-1');
    client.disconnect();
  });

  it('rejects connection without token', async () => {
    const client = connectClient(port, null, { auth: {} });

    const err = await new Promise((resolve) => {
      client.on('connect_error', (e) => resolve(e));
      setTimeout(() => resolve(new Error('no error')), 3000);
    });

    expect(err.message).toMatch(/Authentication required/i);
    client.disconnect();
  });

  it('rejects connection with invalid token', async () => {
    const client = connectClient(port, 'invalid.token.here');

    const err = await new Promise((resolve) => {
      client.on('connect_error', (e) => resolve(e));
      setTimeout(() => resolve(new Error('no error')), 3000);
    });

    expect(err.message).toBeTruthy();
    client.disconnect();
  });

  it('responds to ping with pong', async () => {
    const token = makeToken('user-2');
    const client = connectClient(port, token);

    await new Promise((resolve, reject) => {
      client.on('connected', resolve);
      client.on('connect_error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    const pong = await new Promise((resolve, reject) => {
      client.emit('ping');
      client.on('pong', resolve);
      setTimeout(() => reject(new Error('pong timeout')), 3000);
    });

    expect(pong).toHaveProperty('timestamp');
    client.disconnect();
  });

  it('delivers offline-queued messages on reconnect', async () => {
    // Queue a message before client connects
    const offlineQueueService = new OfflineQueueService();
    offlineQueueService.enqueue('user-offline', 'notification:new', { id: 'msg-1' });

    const tokenVerifier = new JwtTokenVerifier(TEST_SECRET);
    const presenceService2 = new PresenceApplicationService({ presenceStore: buildMockPresenceStore() });

    const app2 = express();
    const server2 = http.createServer(app2);
    const io2 = createSocketServer(server2, {
      frontendUrl: '*',
      tokenVerifier,
      presenceService: presenceService2,
      offlineQueueService,
    });

    const port2 = await new Promise((resolve) => {
      server2.listen(0, () => resolve(server2.address().port));
    });

    const token = makeToken('user-offline');
    const client = connectClient(port2, token);

    // Register the message listener BEFORE the connection is established
    // because deliver() is called before 'connected' is emitted by the server
    const msgPromise = new Promise((resolve, reject) => {
      client.on('notification:new', resolve);
      setTimeout(() => reject(new Error('message not delivered')), 5000);
    });

    await new Promise((resolve, reject) => {
      client.on('connected', resolve);
      client.on('connect_error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    const msg = await msgPromise;

    expect(msg.id).toBe('msg-1');
    expect(msg.wasQueued).toBe(true);

    client.disconnect();
    io2.close();
    await new Promise((resolve) => server2.close(resolve));
  });
});
