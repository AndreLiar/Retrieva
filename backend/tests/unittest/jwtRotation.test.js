/**
 * Unit tests for JWT secret rotation (audit gap A4).
 *
 * The jwt module reads its secrets from env at import time, so each test sets
 * the rotation env vars and re-imports via vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const OLD = 'old-access-secret-key-that-is-at-least-32-chars';
const NEW = 'new-access-secret-key-that-is-at-least-32-chars';
const REFRESH = 'rotation-refresh-secret-at-least-32-characters!!';
const OPTS = { issuer: 'rag-backend', audience: 'rag-api' };

const signWith = (secret, opts = {}) =>
  jwt.sign({ userId: 'u1', email: 'e@x.io', role: 'user' }, secret, {
    ...OPTS,
    expiresIn: '15m',
    ...opts,
  });

async function loadJwt({ primary = NEW, previous } = {}) {
  vi.resetModules();
  process.env.JWT_ACCESS_SECRET = primary;
  process.env.JWT_REFRESH_SECRET = REFRESH;
  if (previous === undefined) delete process.env.JWT_ACCESS_SECRET_PREVIOUS;
  else process.env.JWT_ACCESS_SECRET_PREVIOUS = previous;
  return import('../../utils/security/jwt.js');
}

describe('JWT secret rotation (A4)', () => {
  beforeEach(() => {
    delete process.env.JWT_ACCESS_SECRET_PREVIOUS;
  });

  it('verifies tokens signed with the primary secret', async () => {
    const { generateAccessToken, verifyAccessToken } = await loadJwt();
    const token = generateAccessToken({ userId: 'u1', email: 'e', role: 'user' });
    expect(verifyAccessToken(token).userId).toBe('u1');
  });

  it('still verifies tokens signed with a PREVIOUS secret during rotation', async () => {
    const tokenFromOldKey = signWith(OLD);
    const { verifyAccessToken } = await loadJwt({ primary: NEW, previous: OLD });
    expect(verifyAccessToken(tokenFromOldKey).userId).toBe('u1');
  });

  it('signs new tokens with the primary key, not a previous one', async () => {
    const { generateAccessToken } = await loadJwt({ primary: NEW, previous: OLD });
    const token = generateAccessToken({ userId: 'u1', email: 'e', role: 'user' });
    expect(() => jwt.verify(token, NEW, OPTS)).not.toThrow();
    expect(() => jwt.verify(token, OLD, OPTS)).toThrow();
  });

  it('rejects tokens signed with an unknown secret', async () => {
    const rogue = signWith('totally-unknown-secret-at-least-32-characters!!');
    const { verifyAccessToken } = await loadJwt({ primary: NEW, previous: OLD });
    expect(() => verifyAccessToken(rogue)).toThrow('Invalid access token');
  });

  it('reports expiry (not invalid) for an expired token signed with a previous key', async () => {
    const expired = signWith(OLD, { expiresIn: -10 });
    const { verifyAccessToken } = await loadJwt({ primary: NEW, previous: OLD });
    expect(() => verifyAccessToken(expired)).toThrow('Access token expired');
  });

  it('supports a comma-separated list of previous secrets', async () => {
    const tokenFromOldKey = signWith(OLD);
    const { verifyAccessToken } = await loadJwt({
      primary: NEW,
      previous: `another-old-secret-at-least-32-characters!!, ${OLD}`,
    });
    expect(verifyAccessToken(tokenFromOldKey).userId).toBe('u1');
  });
});
