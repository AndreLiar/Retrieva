/**
 * Unit Tests — EmailApplicationService
 *
 * Tests the application service in isolation using a mock IEmailSender.
 * No Resend SDK, no HTTP, no Express — pure business logic testing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailApplicationService } from '../../src/application/EmailApplicationService.js';

describe('EmailApplicationService', () => {
  let service;
  let mockSender;

  beforeEach(() => {
    mockSender = {
      sendRaw: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-test-123' }),
      verify: vi.fn().mockResolvedValue(true),
    };
    service = new EmailApplicationService({
      emailSender: mockSender,
      frontendUrl: 'http://localhost:3000',
    });
  });

  // ── sendEmail ──────────────────────────────────────────────────────────────

  describe('sendEmail', () => {
    it('delegates to IEmailSender.sendRaw', async () => {
      const result = await service.sendEmail({
        to: 'a@b.com',
        subject: 'Hello',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-test-123');
      expect(mockSender.sendRaw).toHaveBeenCalledWith({
        to: 'a@b.com',
        subject: 'Hello',
        html: '<p>Test</p>',
        text: undefined,
      });
    });

    it('passes text when provided', async () => {
      await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>', text: 'plain' });
      expect(mockSender.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'plain' })
      );
    });

    it('propagates adapter error responses', async () => {
      mockSender.sendRaw.mockResolvedValueOnce({ success: false, error: 'API error' });
      const result = await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('propagates not-configured reason', async () => {
      mockSender.sendRaw.mockResolvedValueOnce({ success: false, reason: 'not-configured' });
      const result = await service.sendEmail({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      expect(result.reason).toBe('not-configured');
    });
  });

  // ── sendWorkspaceInvitation ────────────────────────────────────────────────

  describe('sendWorkspaceInvitation', () => {
    it('builds correct subject with inviter and workspace name', async () => {
      await service.sendWorkspaceInvitation({
        toEmail: 'user@example.com',
        toName: 'Alice',
        inviterName: 'Bob',
        workspaceName: 'Acme Docs',
        workspaceId: 'ws-123',
        role: 'member',
      });

      expect(mockSender.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Bob invited you to "Acme Docs"',
        })
      );
    });

    it('includes workspace URL in HTML body', async () => {
      await service.sendWorkspaceInvitation({
        toEmail: 'user@example.com',
        inviterName: 'Bob',
        workspaceName: 'Acme',
        workspaceId: 'ws-xyz',
        role: 'viewer',
      });

      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('http://localhost:3000/workspaces/ws-xyz');
    });

    it('handles missing toName gracefully', async () => {
      const result = await service.sendWorkspaceInvitation({
        toEmail: 'user@example.com',
        inviterName: 'Bob',
        workspaceName: 'Acme',
        workspaceId: 'ws-1',
        role: 'member',
      });
      expect(result.success).toBe(true);
      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('Hi there');
    });
  });

  // ── sendWelcomeEmail ───────────────────────────────────────────────────────

  describe('sendWelcomeEmail', () => {
    it('sends welcome email with correct subject', async () => {
      await service.sendWelcomeEmail({ toEmail: 'new@example.com', toName: 'Alice' });

      expect(mockSender.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          subject: 'Welcome to Retrieva!',
        })
      );
    });

    it('includes user name in HTML', async () => {
      await service.sendWelcomeEmail({ toEmail: 'new@example.com', toName: 'Alice' });
      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('Alice');
    });

    it('falls back to "there" when name is missing', async () => {
      await service.sendWelcomeEmail({ toEmail: 'new@example.com' });
      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('Hi there');
    });
  });

  // ── sendPasswordResetEmail ─────────────────────────────────────────────────

  describe('sendPasswordResetEmail', () => {
    it('includes reset token in the HTML', async () => {
      await service.sendPasswordResetEmail({
        toEmail: 'user@example.com',
        toName: 'Alice',
        resetToken: 'tok-abc-123',
      });

      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('tok-abc-123');
      expect(html).toContain('http://localhost:3000/reset-password?token=tok-abc-123');
    });

    it('sends correct subject', async () => {
      await service.sendPasswordResetEmail({
        toEmail: 'user@example.com',
        toName: 'Alice',
        resetToken: 'tok',
      });

      const { subject } = mockSender.sendRaw.mock.calls[0][0];
      expect(subject).toBe('Reset Your Password');
    });
  });

  // ── sendEmailVerification ──────────────────────────────────────────────────

  describe('sendEmailVerification', () => {
    it('includes verification token in the HTML', async () => {
      await service.sendEmailVerification({
        toEmail: 'user@example.com',
        toName: 'Alice',
        verificationToken: 'verify-tok-456',
      });

      const { html } = mockSender.sendRaw.mock.calls[0][0];
      expect(html).toContain('verify-tok-456');
      expect(html).toContain('http://localhost:3000/verify-email?token=verify-tok-456');
    });

    it('sends correct subject', async () => {
      await service.sendEmailVerification({
        toEmail: 'user@example.com',
        toName: 'Alice',
        verificationToken: 'tok',
      });

      const { subject } = mockSender.sendRaw.mock.calls[0][0];
      expect(subject).toBe('Verify Your Email Address');
    });
  });

  // ── verifyConnection ───────────────────────────────────────────────────────

  describe('verifyConnection', () => {
    it('delegates to IEmailSender.verify and returns true', async () => {
      const result = await service.verifyConnection();
      expect(result).toBe(true);
      expect(mockSender.verify).toHaveBeenCalled();
    });

    it('returns false when adapter verify returns false', async () => {
      mockSender.verify.mockResolvedValueOnce(false);
      const result = await service.verifyConnection();
      expect(result).toBe(false);
    });
  });
});
