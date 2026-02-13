/**
 * Email Service Unit Tests
 *
 * Tests for email sending functionality using Resend
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock functions shared across tests
const mockSend = vi.fn();
const mockDomainsList = vi.fn();

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Email Service', () => {
  let emailService;
  let originalEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // Reset and set up mock return values
    mockSend.mockReset();
    mockDomainsList.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'test-message-id' }, error: null });
    mockDomainsList.mockResolvedValue({ data: [], error: null });

    // Set up test environment
    process.env.RESEND_API_KEY = 're_test_key_123';
    process.env.SMTP_FROM_NAME = 'Test Platform';
    process.env.RESEND_FROM_EMAIL = 'noreply@test.com';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    // Clear module cache and set up mock before reimport
    vi.resetModules();
    vi.doMock('resend', () => ({
      Resend: vi.fn().mockImplementation(() => ({
        emails: { send: mockSend },
        domains: { list: mockDomainsList },
      })),
    }));

    const module = await import('../../services/emailService.js');
    emailService = module.emailService;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });

    it('should include plain text version', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Plain text content',
      });

      expect(result.success).toBe(true);
    });

    it('should handle send failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('API error'));

      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should handle Resend API error response', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: 'Invalid API key' },
      });

      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });
  });

  describe('sendWorkspaceInvitation', () => {
    it('should send workspace invitation email', async () => {
      const result = await emailService.sendWorkspaceInvitation({
        toEmail: 'invitee@example.com',
        toName: 'John Doe',
        inviterName: 'Jane Smith',
        workspaceName: 'Test Workspace',
        workspaceId: 'workspace-123',
        role: 'member',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invitee@example.com',
          subject: expect.stringContaining('Jane Smith invited you'),
        })
      );
    });

    it('should handle missing toName', async () => {
      const result = await emailService.sendWorkspaceInvitation({
        toEmail: 'invitee@example.com',
        inviterName: 'Jane Smith',
        workspaceName: 'Test Workspace',
        workspaceId: 'workspace-123',
        role: 'viewer',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email', async () => {
      const result = await emailService.sendWelcomeEmail({
        toEmail: 'newuser@example.com',
        toName: 'New User',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newuser@example.com',
          subject: expect.stringContaining('Welcome'),
        })
      );
    });

    it('should handle missing name', async () => {
      const result = await emailService.sendWelcomeEmail({
        toEmail: 'newuser@example.com',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with token', async () => {
      const result = await emailService.sendPasswordResetEmail({
        toEmail: 'user@example.com',
        toName: 'User',
        resetToken: 'reset-token-123',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Reset'),
        })
      );
    });

    it('should include reset URL with token', async () => {
      const result = await emailService.sendPasswordResetEmail({
        toEmail: 'user@example.com',
        toName: 'User',
        resetToken: 'my-reset-token',
      });

      expect(result.success).toBe(true);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('my-reset-token');
    });
  });

  describe('sendEmailVerification', () => {
    it('should send email verification email', async () => {
      const result = await emailService.sendEmailVerification({
        toEmail: 'user@example.com',
        toName: 'User',
        verificationToken: 'verify-token-123',
      });

      expect(result.success).toBe(true);
    });

    it('should include verification URL', async () => {
      const result = await emailService.sendEmailVerification({
        toEmail: 'user@example.com',
        toName: 'User',
        verificationToken: 'my-verify-token',
      });

      expect(result.success).toBe(true);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('my-verify-token');
    });
  });

  describe('verifyConnection', () => {
    it('should verify email connection', async () => {
      const result = await emailService.verifyConnection();

      expect(result).toBe(true);
      expect(mockDomainsList).toHaveBeenCalled();
    });

    it('should return false on verification failure', async () => {
      mockDomainsList.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await emailService.verifyConnection();

      expect(result).toBe(false);
    });
  });
});

describe('Email Service - Not Configured', () => {
  let emailService;
  let originalEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // Remove Resend API key
    delete process.env.RESEND_API_KEY;

    vi.resetModules();
    vi.doMock('resend', () => ({
      Resend: vi.fn().mockImplementation(() => ({
        emails: { send: mockSend },
        domains: { list: mockDomainsList },
      })),
    }));

    const module = await import('../../services/emailService.js');
    emailService = module.emailService;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return failure when not configured', async () => {
    const result = await emailService.sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('not configured');
  });

  it('should return false for verifyConnection', async () => {
    const result = await emailService.verifyConnection();

    expect(result).toBe(false);
  });
});
