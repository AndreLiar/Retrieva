/**
 * Unit Tests — emailService
 *
 * Two execution paths:
 *   local  — in-process Resend calls (default, no EMAIL_SERVICE_URL)
 *   remote — delegates to email-service microservice via internalClient
 *
 * All external dependencies are mocked.
 * Tests focus on: correct HTTP calls, subject/HTML generation, error handling.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// ─── Hoisted mock fns (survive mockReset: true) ───────────────────────────────

const { mockResendSend, mockResendDomainsList, mockInternalPost } = vi.hoisted(() => ({
  mockResendSend: vi.fn(),
  mockResendDomainsList: vi.fn(),
  mockInternalPost: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Regular constructor function (not arrow, not vi.fn) — supports `new Resend()`
// and survives mockReset: true. The singleton _resendClient is created once per file.
vi.mock('resend', () => ({
  Resend: function (_key) {
    this.emails = { send: mockResendSend };
    this.domains = { list: mockResendDomainsList };
  },
}));

vi.mock('../../utils/internalClient.js', () => ({
  internalClient: { post: mockInternalPost },
  default: { post: mockInternalPost },
}));

// Import AFTER mocks are registered
import { emailService } from '../../services/emailService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRONTEND = 'http://localhost:3000';

// ─── _sendEmailInProcess / core Resend layer ──────────────────────────────────

describe('_sendEmailInProcess (via sendEmail)', () => {
  beforeEach(() => {
    // Default: successful send
    mockResendSend.mockResolvedValue({ data: { id: 'msg-abc-123' }, error: null });
  });

  it('returns {success: true, messageId} on success', async () => {
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-abc-123');
  });

  it('passes correct from, to, subject, html to Resend', async () => {
    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Body</p>',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.from).toMatch(/Retrieva/);
    expect(call.to).toBe('user@example.com');
    expect(call.subject).toBe('Test Subject');
    expect(call.html).toBe('<p>Body</p>');
  });

  it('strips HTML tags for the plain-text fallback when text is not provided', async () => {
    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello <strong>World</strong></p>',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.text).toBe('Hello World');
  });

  it('uses provided text over HTML strip', async () => {
    await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>HTML</p>',
      text: 'Plain text version',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.text).toBe('Plain text version');
  });

  it('returns {success: false, error} when Resend API returns an error object', async () => {
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('rate limited');
  });

  it('returns {success: false, error} when client.emails.send throws', async () => {
    mockResendSend.mockRejectedValue(new Error('network timeout'));
    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('network timeout');
  });
});

// ─── verifyConnection ─────────────────────────────────────────────────────────

describe('verifyConnection (in-process)', () => {
  it('returns true when domains.list() succeeds', async () => {
    mockResendDomainsList.mockResolvedValue([]);
    const result = await emailService.verifyConnection();
    expect(result).toBe(true);
  });

  it('returns false when domains.list() throws', async () => {
    mockResendDomainsList.mockRejectedValue(new Error('API error'));
    const result = await emailService.verifyConnection();
    expect(result).toBe(false);
  });
});

// ─── sendWelcomeEmail ─────────────────────────────────────────────────────────

describe('sendWelcomeEmail', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-welcome' }, error: null });
  });

  it('uses the welcome subject line', async () => {
    await emailService.sendWelcomeEmail({ toEmail: 'alice@example.com', toName: 'Alice' });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Welcome to Retrieva');
  });

  it('addresses recipient by name in the HTML', async () => {
    await emailService.sendWelcomeEmail({ toEmail: 'alice@example.com', toName: 'Alice' });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('Hi Alice');
  });

  it('HTML contains dashboard URL', async () => {
    await emailService.sendWelcomeEmail({ toEmail: 'alice@example.com', toName: 'Alice' });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/assessments`);
  });
});

// ─── sendPasswordResetEmail ───────────────────────────────────────────────────

describe('sendPasswordResetEmail', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-reset' }, error: null });
  });

  it('uses "Reset Your Password" subject', async () => {
    await emailService.sendPasswordResetEmail({
      toEmail: 'alice@example.com',
      toName: 'Alice',
      resetToken: 'tok-abc123',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toBe('Reset Your Password');
  });

  it('HTML contains reset URL with the token', async () => {
    await emailService.sendPasswordResetEmail({
      toEmail: 'alice@example.com',
      toName: 'Alice',
      resetToken: 'tok-abc123',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/reset-password?token=tok-abc123`);
  });

  it('uses "there" when toName is not provided', async () => {
    await emailService.sendPasswordResetEmail({
      toEmail: 'alice@example.com',
      resetToken: 'tok-abc123',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('Hi there');
  });
});

// ─── sendEmailVerification ────────────────────────────────────────────────────

describe('sendEmailVerification', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-verify' }, error: null });
  });

  it('uses the verify email subject', async () => {
    await emailService.sendEmailVerification({
      toEmail: 'alice@example.com',
      toName: 'Alice',
      verificationToken: 'verify-tok',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Verify your email');
  });

  it('HTML contains verification URL with token', async () => {
    await emailService.sendEmailVerification({
      toEmail: 'alice@example.com',
      toName: 'Alice',
      verificationToken: 'verify-tok',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/verify-email?token=verify-tok`);
  });

  it('HTML contains 24-hour expiry notice', async () => {
    await emailService.sendEmailVerification({
      toEmail: 'alice@example.com',
      verificationToken: 'verify-tok',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('24 hours');
  });
});

// ─── sendWorkspaceInvitation ──────────────────────────────────────────────────

describe('sendWorkspaceInvitation', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-ws-inv' }, error: null });
  });

  it('subject includes inviter name and workspace name', async () => {
    await emailService.sendWorkspaceInvitation({
      toEmail: 'bob@example.com',
      toName: 'Bob',
      inviterName: 'Alice',
      workspaceName: 'Acme Corp',
      workspaceId: 'ws-001',
      role: 'member',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Alice');
    expect(call.subject).toContain('Acme Corp');
  });

  it('HTML contains workspace URL', async () => {
    await emailService.sendWorkspaceInvitation({
      toEmail: 'bob@example.com',
      inviterName: 'Alice',
      workspaceName: 'Acme Corp',
      workspaceId: 'ws-001',
      role: 'member',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/workspaces/ws-001`);
  });

  it('uses "there" when toName is not provided', async () => {
    await emailService.sendWorkspaceInvitation({
      toEmail: 'bob@example.com',
      inviterName: 'Alice',
      workspaceName: 'Acme Corp',
      workspaceId: 'ws-001',
      role: 'viewer',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('Hi there');
  });
});

// ─── sendQuestionnaireInvitation ──────────────────────────────────────────────

describe('sendQuestionnaireInvitation', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-q-inv' }, error: null });
  });

  it('HTML contains form URL with token', async () => {
    await emailService.sendQuestionnaireInvitation({
      toEmail: 'vendor@example.com',
      toName: 'Vendor Contact',
      senderName: 'Alice',
      workspaceName: 'Acme Corp',
      token: 'q-token-abc',
      expiresAt: null,
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/q/q-token-abc`);
  });

  it('uses "30 days from today" as deadline when expiresAt is null', async () => {
    await emailService.sendQuestionnaireInvitation({
      toEmail: 'vendor@example.com',
      senderName: 'Alice',
      workspaceName: 'Acme Corp',
      token: 'q-token-abc',
      expiresAt: null,
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('30 days from today');
  });

  it('formats deadline from expiresAt date', async () => {
    await emailService.sendQuestionnaireInvitation({
      toEmail: 'vendor@example.com',
      senderName: 'Alice',
      workspaceName: 'Acme Corp',
      token: 'q-token-abc',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    const call = mockResendSend.mock.calls[0][0];
    // Date formatted in en-GB: "1 June 2026"
    expect(call.html).toContain('2026');
  });

  it('subject includes workspace name and DORA reference', async () => {
    await emailService.sendQuestionnaireInvitation({
      toEmail: 'vendor@example.com',
      senderName: 'Alice',
      workspaceName: 'Acme Corp',
      token: 'q-tok',
      expiresAt: null,
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Acme Corp');
    expect(call.subject).toContain('DORA');
  });
});

// ─── sendOrganizationInvitation ───────────────────────────────────────────────

describe('sendOrganizationInvitation', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-org-inv' }, error: null });
  });

  it.each([
    ['org_admin', 'Admin'],
    ['analyst', 'Analyst'],
    ['viewer', 'Viewer'],
    ['unknown_role', 'unknown_role'],
  ])('maps role "%s" to label "%s"', async (role, label) => {
    await emailService.sendOrganizationInvitation({
      toEmail: 'user@example.com',
      inviterName: 'Alice',
      organizationName: 'Retrieva Inc',
      role,
      inviteToken: 'inv-tok',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(label);
  });

  it('HTML contains invite URL with token', async () => {
    await emailService.sendOrganizationInvitation({
      toEmail: 'user@example.com',
      inviterName: 'Alice',
      organizationName: 'Retrieva Inc',
      role: 'analyst',
      inviteToken: 'inv-tok-xyz',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/join?token=inv-tok-xyz`);
  });

  it('subject includes inviter and organization name', async () => {
    await emailService.sendOrganizationInvitation({
      toEmail: 'user@example.com',
      inviterName: 'Alice',
      organizationName: 'Retrieva Inc',
      role: 'analyst',
      inviteToken: 'inv-tok',
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Alice');
    expect(call.subject).toContain('Retrieva Inc');
  });
});

// ─── sendMonitoringAlert — subjects ──────────────────────────────────────────

describe('sendMonitoringAlert — subjects', () => {
  const WORKSPACE = 'Acme Vendor';

  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-alert' }, error: null });
  });

  it.each([
    ['cert-expiry-90', '90-Day Warning'],
    ['cert-expiry-30', '30-Day Warning'],
    ['cert-expiry-7', 'URGENT'],
    ['contract-renewal-60', 'Action Required'],
    ['annual-review-overdue', 'Overdue'],
    ['assessment-overdue-12mo', 'Reminder'],
    ['review-due-30', '30-Day Notice'],
  ])('alert type "%s" produces subject containing "%s"', async (alertType, subjectPart) => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: 'Alice',
      workspaceName: WORKSPACE,
      alertType,
      details: {
        certType: 'ISO 27001',
        expiryDate: '2026-12-31',
        contractEnd: '2026-12-31',
        reviewDate: '2026-06-01',
        lastAssessmentDate: '2025-01-01',
      },
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain(subjectPart);
    expect(call.subject).toContain(WORKSPACE);
  });

  it('uses fallback subject for unknown alert type', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      workspaceName: WORKSPACE,
      alertType: 'unknown-type',
      details: {},
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toContain('Compliance Alert');
    expect(call.subject).toContain(WORKSPACE);
  });
});

// ─── buildMonitoringAlertHtml (via sendMonitoringAlert) ───────────────────────

describe('buildMonitoringAlertHtml content', () => {
  beforeEach(() => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-alert' }, error: null });
  });

  it('uses "Compliance Team" greeting when toName is null', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: null,
      workspaceName: 'Acme',
      alertType: 'cert-expiry-30',
      details: { certType: 'ISO 27001', expiryDate: '2026-12-31' },
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('Compliance Team');
  });

  it('uses fallback HTML message for unknown alert type', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: 'Alice',
      workspaceName: 'Acme',
      alertType: 'totally-unknown',
      details: {},
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('compliance alert has been triggered');
  });

  it('cert-expiry-7 HTML contains "URGENT" language', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: 'Alice',
      workspaceName: 'Acme',
      alertType: 'cert-expiry-7',
      details: { certType: 'SOC 2', expiryDate: '2026-01-10' },
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('URGENT');
  });

  it('assessment-overdue-12mo HTML shows "never" when no lastAssessmentDate', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: 'Alice',
      workspaceName: 'Acme',
      alertType: 'assessment-overdue-12mo',
      details: { lastAssessmentDate: null },
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain('never');
  });

  it('HTML contains Settings link', async () => {
    await emailService.sendMonitoringAlert({
      toEmail: 'user@example.com',
      toName: 'Alice',
      workspaceName: 'Acme',
      alertType: 'cert-expiry-90',
      details: { certType: 'ISO 27001', expiryDate: '2026-12-31' },
    });
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).toContain(`${FRONTEND}/settings`);
  });
});

// ─── Remote path (EMAIL_SERVICE_URL configured) ───────────────────────────────

describe('remote path (EMAIL_SERVICE_URL set)', () => {
  let remoteService;

  beforeAll(async () => {
    process.env.EMAIL_SERVICE_URL = 'http://email-service:3001';
    vi.resetModules();
    const mod = await import('../../services/emailService.js');
    remoteService = mod.emailService;
  });

  afterAll(() => {
    delete process.env.EMAIL_SERVICE_URL;
  });

  beforeEach(() => {
    mockInternalPost.mockResolvedValue({ success: true });
  });

  it('sendWelcomeEmail delegates to /internal/email/welcome', async () => {
    await remoteService.sendWelcomeEmail({ toEmail: 'alice@example.com', toName: 'Alice' });
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/welcome',
      { toEmail: 'alice@example.com', toName: 'Alice' }
    );
  });

  it('sendPasswordResetEmail delegates to /internal/email/password-reset', async () => {
    const payload = { toEmail: 'alice@example.com', resetToken: 'tok' };
    await remoteService.sendPasswordResetEmail(payload);
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/password-reset',
      payload
    );
  });

  it('sendMonitoringAlert delegates to /internal/email/monitoring-alert', async () => {
    const payload = { toEmail: 'alice@example.com', alertType: 'cert-expiry-7', details: {} };
    await remoteService.sendMonitoringAlert(payload);
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/monitoring-alert',
      payload
    );
  });

  it('verifyConnection delegates to /internal/email/health', async () => {
    await remoteService.verifyConnection();
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/health',
      {}
    );
  });

  it('callEmailService returns {success: false} on internalClient.post failure', async () => {
    mockInternalPost.mockRejectedValue(new Error('connection refused'));
    const result = await remoteService.sendWelcomeEmail({ toEmail: 'alice@example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });

  it('sendEmail delegates to /internal/email/send', async () => {
    const payload = { to: 'alice@example.com', subject: 'Test', html: '<p>Hi</p>' };
    await remoteService.sendEmail(payload);
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/send',
      payload
    );
  });

  it('sendWorkspaceInvitation delegates to /internal/email/workspace-invitation', async () => {
    const payload = { toEmail: 'bob@example.com', workspaceName: 'Acme' };
    await remoteService.sendWorkspaceInvitation(payload);
    expect(mockInternalPost).toHaveBeenCalledWith(
      'http://email-service:3001',
      '/internal/email/workspace-invitation',
      payload
    );
  });
});
