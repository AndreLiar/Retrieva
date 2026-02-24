/**
 * Integration Tests — email-service HTTP interface
 *
 * Tests the Express router wired to a mock EmailApplicationService.
 * Verifies HTTP contracts: routes, request/response shapes, status codes.
 * Does NOT use a real Resend client — adapter is mocked at the port boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import { EmailApplicationService } from '../../src/application/EmailApplicationService.js';
import { createEmailRouter } from '../../src/interface/http/createRouter.js';

/** Build a test Express app with a mock IEmailSender */
function buildTestApp(senderOverrides = {}) {
  const mockSender = {
    sendRaw: vi.fn().mockResolvedValue({ success: true, messageId: 'test-id' }),
    verify: vi.fn().mockResolvedValue(true),
    ...senderOverrides,
  };

  const service = new EmailApplicationService({
    emailSender: mockSender,
    frontendUrl: 'http://localhost:3000',
  });

  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'email-service' }));
  app.use('/internal/email', createEmailRouter(service));

  return { app, mockSender };
}

describe('email-service HTTP', () => {
  let request;
  let mockSender;

  beforeEach(() => {
    const built = buildTestApp();
    request = supertest(built.app);
    mockSender = built.mockSender;
  });

  // ── Health check ───────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request.get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('email-service');
    });
  });

  // ── POST /internal/email/send ─────────────────────────────────────────────

  describe('POST /internal/email/send', () => {
    it('returns success when adapter succeeds', async () => {
      const res = await request.post('/internal/email/send').send({
        to: 'test@example.com',
        subject: 'Hello',
        html: '<p>Test</p>',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe('test-id');
      expect(mockSender.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com', subject: 'Hello' })
      );
    });

    it('returns failure when adapter returns error', async () => {
      const { app, mockSender: ms } = buildTestApp({
        sendRaw: vi.fn().mockResolvedValue({ success: false, error: 'API error' }),
      });
      const res = await supertest(app).post('/internal/email/send').send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('API error');
    });

    it('returns not-configured reason when no API key', async () => {
      const { app } = buildTestApp({
        sendRaw: vi.fn().mockResolvedValue({ success: false, reason: 'not-configured' }),
      });
      const res = await supertest(app).post('/internal/email/send').send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(res.body.success).toBe(false);
      expect(res.body.reason).toBe('not-configured');
    });
  });

  // ── POST /internal/email/workspace-invitation ─────────────────────────────

  describe('POST /internal/email/workspace-invitation', () => {
    it('calls service with correct params and returns success', async () => {
      const res = await request.post('/internal/email/workspace-invitation').send({
        toEmail: 'invitee@example.com',
        toName: 'Alice',
        inviterName: 'Bob',
        workspaceName: 'Test WS',
        workspaceId: 'ws-1',
        role: 'member',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { to, subject } = mockSender.sendRaw.mock.calls[0][0];
      expect(to).toBe('invitee@example.com');
      expect(subject).toContain('Bob invited you');
    });
  });

  // ── POST /internal/email/welcome ──────────────────────────────────────────

  describe('POST /internal/email/welcome', () => {
    it('sends welcome email and returns success', async () => {
      const res = await request.post('/internal/email/welcome').send({
        toEmail: 'new@example.com',
        toName: 'New User',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSender.sendRaw.mock.calls[0][0].to).toBe('new@example.com');
    });
  });

  // ── POST /internal/email/password-reset ──────────────────────────────────

  describe('POST /internal/email/password-reset', () => {
    it('includes token in HTML and returns success', async () => {
      const res = await request.post('/internal/email/password-reset').send({
        toEmail: 'user@example.com',
        toName: 'User',
        resetToken: 'tok-xyz',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('tok-xyz');
    });
  });

  // ── POST /internal/email/email-verification ───────────────────────────────

  describe('POST /internal/email/email-verification', () => {
    it('includes token in HTML and returns success', async () => {
      const res = await request.post('/internal/email/email-verification').send({
        toEmail: 'user@example.com',
        toName: 'User',
        verificationToken: 'verify-xyz',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('verify-xyz');
    });
  });

  // ── POST /internal/email/health ───────────────────────────────────────────

  describe('POST /internal/email/health', () => {
    it('returns connected: true when adapter verifies', async () => {
      const res = await request.post('/internal/email/health').send({});
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
    });

    it('returns connected: false when adapter verify fails', async () => {
      const { app } = buildTestApp({ verify: vi.fn().mockResolvedValue(false) });
      const res = await supertest(app).post('/internal/email/health').send({});
      expect(res.body.connected).toBe(false);
    });
  });
});
