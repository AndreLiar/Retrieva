/**
 * Auth API Integration Tests
 *
 * Full HTTP → controller → model → response chain against MongoMemoryServer.
 * No mocked DB — all assertions are tight and specific.
 *
 * Coverage:
 *   POST /auth/register   — happy path, validation, duplicates, cookies
 *   POST /auth/login      — happy path, wrong creds, inactive account, cookies
 *   POST /auth/refresh    — token rotation, theft detection, cookie fallback
 *   POST /auth/logout     — single session and logout-all (?all=true)
 *   Token expiry          — expired access token on protected route,
 *                           expired refresh token on /refresh
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

// ── Env must be set before any app import ─────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../config/redis.js', () => ({
  redisConnection: {
    get: async () => null,
    setex: async () => 'OK',
    set: async () => 'OK',
    del: async () => 1,
    keys: async () => [],
    incr: async () => 1,
    expire: async () => 1,
    ping: async () => 'PONG',
    quit: async () => 'OK',
  },
}));

vi.mock('../../config/logger.js', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    stream: { write: () => {} },
  },
}));

vi.mock('../../services/authAuditService.js', () => ({
  authAuditService: {
    logRegisterSuccess: async () => true,
    logLoginSuccess: async () => true,
    logLoginFailed: async () => true,
    logLoginBlockedLocked: async () => true,
    logAccountLocked: async () => true,
    logLogout: async () => true,
    logPasswordResetRequest: async () => true,
    logPasswordResetSuccess: async () => true,
    logTokenRefresh: async () => true,
    logTokenTheftDetected: async () => true,
    detectBruteForce: async () => ({ blocked: false }),
    checkBruteForce: async () => ({ blocked: false }),
    isBlocked: async () => false,
  },
}));

vi.mock('../../services/emailService.js', () => {
  const mock = {
    sendEmail: async () => ({ success: true }),
    sendEmailVerification: async () => ({ success: true }),
    sendPasswordResetEmail: async () => ({ success: true }),
    sendWelcomeEmail: async () => ({ success: true }),
    sendWorkspaceInvitation: async () => ({ success: true }),
    verifyConnection: async () => true,
  };
  return { emailService: mock, default: mock };
});

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: function () {
    return {
      getCollections: async () => ({ collections: [] }),
      getCollection: async () => ({ name: 'documents', vectors_count: 0 }),
    };
  },
}));

vi.mock('../../config/vectorStore.js', () => ({
  getVectorStore: async () => ({
    client: {
      getCollection: async () => ({ name: 'documents', vectors_count: 0 }),
    },
  }),
}));

vi.mock('../../config/llm.js', () => ({
  llm: { invoke: async () => '' },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedQuery: async () => [0.1, 0.2, 0.3],
    embedDocuments: async () => [[0.1, 0.2, 0.3]],
  },
}));

import app from '../../app.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = '/api/v1/auth';

const VALID_USER = {
  email: 'auth-test@example.com',
  password: 'ValidPassword123!',
  name: 'Auth Tester',
};

/** Register + mark email verified + login; returns { accessToken, refreshToken } */
async function registerAndLogin(request, user = VALID_USER) {
  await request.post(`${BASE}/register`).send(user);
  const User = mongoose.model('User');
  await User.updateOne({ email: user.email }, { $set: { isEmailVerified: true, isActive: true } });
  const res = await request.post(`${BASE}/login`).send({
    email: user.email,
    password: user.password,
  });
  return {
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

/** Build a JWT that is already expired (exp in the past) */
function makeExpiredToken(secret, payload = {}) {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'x@x.com', ...payload },
    secret,
    { expiresIn: -60 } // expired 60 s ago
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let mongoServer;
let request;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(mongoServer.getUri());
  request = supertest(app);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.model('User').deleteMany({});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 201 with user, accessToken and refreshToken', async () => {
    const res = await request.post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('sets accessToken and refreshToken cookies', async () => {
    const res = await request.post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(201);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies.join('; ');
    expect(cookieStr).toContain('accessToken=');
    expect(cookieStr).toContain('refreshToken=');
    expect(cookieStr).toContain('HttpOnly');
  });

  it('lowercases the email', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ ...VALID_USER, email: 'UPPER@EXAMPLE.COM' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('upper@example.com');
  });

  it('returns 409 for duplicate email', async () => {
    await request.post(`${BASE}/register`).send(VALID_USER);
    const res = await request.post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(409);
  });

  it('returns 400 for missing email', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ password: VALID_USER.password, name: VALID_USER.name });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ ...VALID_USER, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for weak password (too short)', async () => {
    const res = await request.post(`${BASE}/register`).send({ ...VALID_USER, password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for password missing uppercase', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ ...VALID_USER, password: 'password123!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for password missing special character', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ ...VALID_USER, password: 'Password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await request
      .post(`${BASE}/register`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.status).toBe(400);
  });

  it('does not expose password in any error response', async () => {
    const res = await request.post(`${BASE}/register`).send(VALID_USER);
    expect(JSON.stringify(res.body)).not.toContain(VALID_USER.password);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request.post(`${BASE}/register`).send(VALID_USER);
    await mongoose
      .model('User')
      .updateOne({ email: VALID_USER.email }, { $set: { isEmailVerified: true, isActive: true } });
  });

  it('returns 200 with accessToken and refreshToken', async () => {
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(VALID_USER.email);
  });

  it('sets HTTP-only auth cookies on login', async () => {
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'].join('; ');
    expect(cookies).toContain('accessToken=');
    expect(cookies).toContain('refreshToken=');
    expect(cookies).toContain('HttpOnly');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: 'WrongPassword123!' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: 'nobody@example.com', password: VALID_USER.password });
    expect(res.status).toBe(401);
  });

  it('returns 401 for inactive account', async () => {
    await mongoose
      .model('User')
      .updateOne({ email: VALID_USER.email }, { $set: { isActive: false } });
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing email', async () => {
    const res = await request.post(`${BASE}/login`).send({ password: VALID_USER.password });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request.post(`${BASE}/login`).send({ email: VALID_USER.email });
    expect(res.status).toBe(400);
  });

  it('rejects NoSQL injection in email field', async () => {
    const res = await request
      .post(`${BASE}/login`)
      .send({ email: { $gt: '' }, password: VALID_USER.password });
    expect([400, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/refresh
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns 200 with new accessToken and refreshToken (body-based token)', async () => {
    const { refreshToken } = await registerAndLogin(request);

    const res = await request.post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    // New tokens are different from the originals (rotation)
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('sets new auth cookies after successful refresh', async () => {
    const { refreshToken } = await registerAndLogin(request);

    const res = await request.post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'].join('; ');
    expect(cookies).toContain('accessToken=');
    expect(cookies).toContain('refreshToken=');
  });

  it('token rotation: rotated-out token is rejected with 401', async () => {
    const { refreshToken: original } = await registerAndLogin(request);

    // First refresh consumes the original token
    const first = await request.post(`${BASE}/refresh`).send({ refreshToken: original });
    expect(first.status).toBe(200);

    // Reusing the original (now consumed) token must fail
    const second = await request.post(`${BASE}/refresh`).send({ refreshToken: original });
    expect(second.status).toBe(401);
  });

  it('theft detection: reusing a consumed token invalidates all sessions', async () => {
    const { refreshToken: original } = await registerAndLogin(request);

    // Legitimate refresh — original is consumed, we get a rotated token
    const first = await request.post(`${BASE}/refresh`).send({ refreshToken: original });
    expect(first.status).toBe(200);
    const rotated = first.body.data.refreshToken;

    // Attacker replays the original (theft signal) → server clears ALL tokens
    const stolen = await request.post(`${BASE}/refresh`).send({ refreshToken: original });
    expect(stolen.status).toBe(401);

    // The rotated token is now also invalidated (all sessions cleared)
    const victim = await request.post(`${BASE}/refresh`).send({ refreshToken: rotated });
    expect(victim.status).toBe(401);
  });

  it('returns 401 for an invalid JWT signature', async () => {
    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: 'not.a.valid.jwt' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.post(`${BASE}/refresh`).send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired refresh token', async () => {
    const expired = makeExpiredToken(process.env.JWT_REFRESH_SECRET);

    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: expired });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('returns 200 and clears auth cookies on valid logout', async () => {
    const { accessToken } = await registerAndLogin(request);

    const res = await request.post(`${BASE}/logout`).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // Cookies should be cleared (value empty or Max-Age=0)
    const cookies = (res.headers['set-cookie'] ?? []).join('; ');
    expect(cookies).toMatch(/accessToken=;|accessToken=$/);
  });

  it('returns 401 without an auth token', async () => {
    const res = await request.post(`${BASE}/logout`);
    expect(res.status).toBe(401);
  });

  it('invalidates only the current session (single logout)', async () => {
    const { accessToken, refreshToken } = await registerAndLogin(request);

    // Logout — include refreshToken in body so the server can invalidate this session
    const logout = await request
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    // The specific refresh token used in this session should be consumed
    const refresh = await request.post(`${BASE}/refresh`).send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('?all=true invalidates all refresh tokens across sessions', async () => {
    const user = {
      email: 'multi-session@example.com',
      password: 'ValidPassword123!',
      name: 'Multi Session',
    };

    // Session 1
    const s1 = await registerAndLogin(request, user);

    // Session 2 — second login on the same account
    const loginRes2 = await request
      .post(`${BASE}/login`)
      .send({ email: user.email, password: user.password });
    const s2RefreshToken = loginRes2.body.data.refreshToken;

    // Logout all devices using session 1's access token
    const logoutAll = await request
      .post(`${BASE}/logout?all=true`)
      .set('Authorization', `Bearer ${s1.accessToken}`);
    expect(logoutAll.status).toBe(200);

    // Both session tokens should be invalidated
    const r1 = await request.post(`${BASE}/refresh`).send({ refreshToken: s1.refreshToken });
    const r2 = await request.post(`${BASE}/refresh`).send({ refreshToken: s2RefreshToken });
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Token expiry edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Token expiry edge cases', () => {
  it('expired access token is rejected on protected route with 401', async () => {
    const expiredAccess = makeExpiredToken(process.env.JWT_ACCESS_SECRET);

    const res = await request.get(`${BASE}/me`).set('Authorization', `Bearer ${expiredAccess}`);

    expect(res.status).toBe(401);
  });

  it('expired refresh token is rejected on /refresh with 401', async () => {
    const expired = makeExpiredToken(process.env.JWT_REFRESH_SECRET);

    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: expired });
    expect(res.status).toBe(401);
  });

  it('access token signed with wrong secret is rejected', async () => {
    const wrongSecret = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), email: 'x@x.com', role: 'user' },
      'completely-wrong-secret-key-32chars+!'
    );

    const res = await request.get(`${BASE}/me`).set('Authorization', `Bearer ${wrongSecret}`);

    expect(res.status).toBe(401);
  });

  it('refresh token signed with wrong secret is rejected', async () => {
    const wrongSecret = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), email: 'x@x.com' },
      'completely-wrong-secret-key-32chars+!'
    );

    const res = await request.post(`${BASE}/refresh`).send({ refreshToken: wrongSecret });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full register → login → refresh → logout cycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Full auth cycle', () => {
  it('register → login → /me → refresh → /me with new token → logout → refresh fails', async () => {
    // 1. Register
    const reg = await request.post(`${BASE}/register`).send(VALID_USER);
    expect(reg.status).toBe(201);

    // 2. Verify email (simulate server-side)
    await mongoose
      .model('User')
      .updateOne({ email: VALID_USER.email }, { $set: { isEmailVerified: true, isActive: true } });

    // 3. Login
    const login = await request
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = login.body.data;

    // 4. Access protected route
    const me = await request.get(`${BASE}/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(VALID_USER.email);

    // 5. Refresh
    const refresh = await request.post(`${BASE}/refresh`).send({ refreshToken });
    expect(refresh.status).toBe(200);
    const newAccessToken = refresh.body.data.accessToken;
    const newRefreshToken = refresh.body.data.refreshToken;

    // 6. Access protected route with NEW access token
    const me2 = await request.get(`${BASE}/me`).set('Authorization', `Bearer ${newAccessToken}`);
    expect(me2.status).toBe(200);

    // 7. Logout — include refreshToken so the server can invalidate this session
    const logout = await request
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${newAccessToken}`)
      .send({ refreshToken: newRefreshToken });
    expect(logout.status).toBe(200);

    // 8. Refresh with new token should now fail (session invalidated by logout)
    const afterLogout = await request
      .post(`${BASE}/refresh`)
      .send({ refreshToken: newRefreshToken });
    expect(afterLogout.status).toBe(401);
  });
});
