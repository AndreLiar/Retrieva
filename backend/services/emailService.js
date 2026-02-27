/**
 * Email Service — Monolith Proxy
 *
 * All email sending is delegated to the standalone email-service microservice
 * (see /email-service/). The public API (method names + signatures) is
 * identical to the original, so no callsite in the monolith needs to change.
 *
 * Routing:
 *   EMAIL_SERVICE_URL is set  → HTTP POST via internalClient (X-Service-Name header included)
 *   EMAIL_SERVICE_URL not set → falls back to in-process Resend calls so the
 *                               backend works without Docker for local dev.
 *
 * @module services/emailService
 */

import { internalClient } from '../utils/internalClient.js';
import { Resend } from 'resend';
import logger from '../config/logger.js';

const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL;

// ---------------------------------------------------------------------------
// Remote path (email-service is running)
// ---------------------------------------------------------------------------

async function callEmailService(path, payload) {
  return internalClient.post(EMAIL_SERVICE_URL, path, payload).catch((err) => {
    logger.error('Email service call failed', {
      service: 'email',
      path,
      error: err.message,
    });
    return { success: false, error: err.message };
  });
}

// ---------------------------------------------------------------------------
// In-process fallback (local dev without docker-compose)
// ---------------------------------------------------------------------------

const EMAIL_CONFIG = {
  apiKey: process.env.RESEND_API_KEY,
  from: {
    name: process.env.SMTP_FROM_NAME || 'Retrieva',
    email: process.env.RESEND_FROM_EMAIL || 'noreply@retrieva.online',
  },
};
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

let _resendClient = null;
function getResendClient() {
  if (!_resendClient) {
    if (!EMAIL_CONFIG.apiKey) {
      logger.warn('Email service not configured — missing RESEND_API_KEY', { service: 'email' });
      return null;
    }
    _resendClient = new Resend(EMAIL_CONFIG.apiKey);
  }
  return _resendClient;
}

async function _sendEmailInProcess({ to, subject, html, text }) {
  const client = getResendClient();
  if (!client) return { success: false, reason: 'Email service not configured' };

  try {
    const { data, error } = await client.emails.send({
      from: `${EMAIL_CONFIG.from.name} <${EMAIL_CONFIG.from.email}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    if (error) {
      logger.error('Failed to send email', { service: 'email', to, subject, error: error.message });
      return { success: false, error: error.message };
    }
    logger.info('Email sent successfully', { service: 'email', messageId: data.id, to, subject });
    return { success: true, messageId: data.id };
  } catch (err) {
    logger.error('Failed to send email', { service: 'email', to, subject, error: err.message });
    return { success: false, error: err.message };
  }
}

async function _verifyConnectionInProcess() {
  const client = getResendClient();
  if (!client) return false;
  try {
    await client.domains.list();
    logger.info('Email service connection verified', { service: 'email' });
    return true;
  } catch (err) {
    logger.error('Email service connection failed', { service: 'email', error: err.message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API — identical to the original emailService.js interface
// ---------------------------------------------------------------------------

const remote = {
  sendEmail: (p) => callEmailService('/internal/email/send', p),
  sendWorkspaceInvitation: (p) => callEmailService('/internal/email/workspace-invitation', p),
  sendWelcomeEmail: (p) => callEmailService('/internal/email/welcome', p),
  sendPasswordResetEmail: (p) => callEmailService('/internal/email/password-reset', p),
  sendEmailVerification: (p) => callEmailService('/internal/email/email-verification', p),
  sendQuestionnaireInvitation: (p) =>
    callEmailService('/internal/email/questionnaire-invitation', p),
  sendMonitoringAlert: (p) => callEmailService('/internal/email/monitoring-alert', p),
  sendOrganizationInvitation: (p) => callEmailService('/internal/email/org-invitation', p),
  verifyConnection: () => callEmailService('/internal/email/health', {}),
};

function buildMonitoringAlertHtml({ toName, workspaceName, alertType, details }) {
  const settingsUrl = `${FRONTEND_URL}/settings`;
  const alertMessages = {
    'cert-expiry-90': `The <strong>${details.certType}</strong> certification for vendor <strong>${workspaceName}</strong> will expire on <strong>${details.expiryDate}</strong> (in ~90 days). Begin the renewal process now to avoid a compliance gap.`,
    'cert-expiry-30': `The <strong>${details.certType}</strong> certification for vendor <strong>${workspaceName}</strong> expires on <strong>${details.expiryDate}</strong> — only 30 days remaining. Immediate action is required.`,
    'cert-expiry-7': `URGENT: The <strong>${details.certType}</strong> certification for vendor <strong>${workspaceName}</strong> expires on <strong>${details.expiryDate}</strong>. Only 7 days remain. Take action today.`,
    'contract-renewal-60': `The ICT service contract with vendor <strong>${workspaceName}</strong> is due for renewal on <strong>${details.contractEnd}</strong> (60 days from now). Schedule a review with your legal team.`,
    'annual-review-overdue': `The scheduled annual DORA vendor review for <strong>${workspaceName}</strong> was due on <strong>${details.reviewDate}</strong> and has not been completed. Please schedule this review to maintain compliance.`,
    'assessment-overdue-12mo': `No DORA gap assessment has been run for vendor <strong>${workspaceName}</strong> in over 12 months. The last assessment was ${details.lastAssessmentDate ? `on <strong>${details.lastAssessmentDate}</strong>` : '<strong>never</strong>'}. DORA Article 28 requires periodic reviews.`,
  };
  const message =
    alertMessages[alertType] ||
    `A compliance alert has been triggered for vendor <strong>${workspaceName}</strong>.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
    <span style="font-weight: 700; font-size: 18px; color: #0f172a;">Retrieva</span>
    <span style="font-size: 12px; color: #64748b; margin-left: 8px;">Compliance Monitoring</span>
  </div>

  <p style="margin: 0 0 16px;">Dear ${toName || 'Compliance Team'},</p>

  <p style="margin: 0 0 16px;">${message}</p>

  <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0; font-weight: 600; color: #854d0e;">Action Required</p>
    <p style="margin: 8px 0 0; font-size: 14px; color: #713f12;">
      Please log in to Retrieva to review this vendor's compliance status and take the necessary action.
    </p>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${settingsUrl}"
       style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none;
              padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
      Open Retrieva
    </a>
  </div>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 16px;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      This automated alert was sent by Retrieva compliance monitoring. To manage your notification preferences, visit your account settings.
    </p>
  </div>
</body>
</html>`;
}

const local = {
  sendEmail: _sendEmailInProcess,

  async sendWorkspaceInvitation({
    toEmail,
    toName,
    inviterName,
    workspaceName,
    workspaceId,
    role,
  }) {
    const workspaceUrl = `${FRONTEND_URL}/workspaces/${workspaceId}`;
    const subject = `${inviterName} invited you to "${workspaceName}"`;
    const html = `<p>Hi ${toName || 'there'}, ${inviterName} invited you to <strong>${workspaceName}</strong> as <strong>${role}</strong>. <a href="${workspaceUrl}">Open Workspace</a></p>`;
    return _sendEmailInProcess({ to: toEmail, subject, html });
  },

  async sendWelcomeEmail({ toEmail, toName }) {
    return _sendEmailInProcess({
      to: toEmail,
      subject: 'Welcome to Retrieva!',
      html: `<p>Hi ${toName || 'there'}, welcome to Retrieva!</p>`,
    });
  },

  async sendPasswordResetEmail({ toEmail, toName, resetToken }) {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
    return _sendEmailInProcess({
      to: toEmail,
      subject: 'Reset Your Password',
      html: `<p>Hi ${toName || 'there'}, <a href="${resetUrl}">reset your password</a>.</p>`,
    });
  },

  async sendEmailVerification({ toEmail, toName, verificationToken }) {
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
    return _sendEmailInProcess({
      to: toEmail,
      subject: 'Verify Your Email Address',
      html: `<p>Hi ${toName || 'there'}, <a href="${verifyUrl}">verify your email</a>.</p>`,
    });
  },

  async sendQuestionnaireInvitation({
    toEmail,
    toName,
    senderName,
    workspaceName,
    token,
    expiresAt,
  }) {
    const formUrl = `${FRONTEND_URL}/q/${token}`;
    const deadline = expiresAt
      ? new Date(expiresAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '30 days from today';

    const subject = `[Action Required] DORA Due Diligence Questionnaire from ${workspaceName}`;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
    <span style="font-weight: 700; font-size: 18px; color: #0f172a;">Retrieva</span>
    <span style="font-size: 12px; color: #64748b; margin-left: 8px;">Third-Party Risk</span>
  </div>

  <p style="margin: 0 0 16px;">Dear ${toName || 'Vendor Contact'},</p>

  <p style="margin: 0 0 16px;">
    <strong>${senderName}</strong> at <strong>${workspaceName}</strong> has requested that you complete a
    DORA Article 28/30 Due Diligence Questionnaire as part of their third-party ICT risk management programme.
  </p>

  <p style="margin: 0 0 16px;">
    The questionnaire covers 20 questions across 8 DORA compliance categories including ICT governance,
    security controls, incident management, and business continuity. Your responses will be treated
    confidentially and used solely for compliance assessment purposes.
  </p>

  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-weight: 600;">Response deadline: ${deadline}</p>
    <p style="margin: 0; font-size: 14px; color: #64748b;">This link will expire on ${deadline}. No login is required.</p>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${formUrl}"
       style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none;
              padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
      Complete Questionnaire
    </a>
  </div>

  <p style="font-size: 13px; color: #64748b; margin: 24px 0 0;">
    If the button above does not work, copy and paste this link into your browser:<br>
    <a href="${formUrl}" style="color: #0f172a; word-break: break-all;">${formUrl}</a>
  </p>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 16px;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      This email was sent on behalf of ${workspaceName} via Retrieva. If you believe you received this in error, please ignore it.
    </p>
  </div>
</body>
</html>`;

    return _sendEmailInProcess({ to: toEmail, subject, html });
  },

  async sendOrganizationInvitation({ toEmail, inviterName, organizationName, role, inviteToken }) {
    const inviteUrl = `${FRONTEND_URL}/join?token=${inviteToken}`;
    const roleLabel = { org_admin: 'Admin', analyst: 'Analyst', viewer: 'Viewer' }[role] || role;
    const subject = `${inviterName} invited you to join ${organizationName} on Retrieva`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
    <span style="font-weight: 700; font-size: 18px; color: #0f172a;">Retrieva</span>
    <span style="font-size: 12px; color: #64748b; margin-left: 8px;">Compliance Platform</span>
  </div>

  <p style="margin: 0 0 16px;">Hi there,</p>

  <p style="margin: 0 0 16px;">
    <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong>
    on Retrieva as <strong>${roleLabel}</strong>.
  </p>

  <p style="margin: 0 0 16px;">
    Retrieva is a DORA compliance platform that helps financial entities manage third-party ICT risk.
    As a member of ${organizationName}, you'll have access to all vendor workspaces and compliance tools.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${inviteUrl}"
       style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none;
              padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
      Accept Invitation
    </a>
  </div>

  <p style="font-size: 13px; color: #64748b; margin: 24px 0 0;">
    If the button above does not work, copy and paste this link into your browser:<br>
    <a href="${inviteUrl}" style="color: #0f172a; word-break: break-all;">${inviteUrl}</a>
  </p>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 16px;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore it.
    </p>
  </div>
</body>
</html>`;
    return _sendEmailInProcess({ to: toEmail, subject, html });
  },

  async sendMonitoringAlert({ toEmail, toName, workspaceName, alertType, details }) {
    const subjects = {
      'cert-expiry-90': `[90-Day Warning] ${details.certType} certification expiring for ${workspaceName}`,
      'cert-expiry-30': `[30-Day Warning] ${details.certType} certification expiring soon for ${workspaceName}`,
      'cert-expiry-7': `[URGENT] ${details.certType} certification expires in 7 days — ${workspaceName}`,
      'contract-renewal-60': `[Action Required] Contract renewal due in 60 days — ${workspaceName}`,
      'annual-review-overdue': `[Overdue] Annual vendor review required for ${workspaceName}`,
      'assessment-overdue-12mo': `[Reminder] No DORA assessment run in 12 months — ${workspaceName}`,
    };
    const subject = subjects[alertType] || `Compliance Alert — ${workspaceName}`;
    const html = buildMonitoringAlertHtml({ toName, workspaceName, alertType, details });
    return _sendEmailInProcess({ to: toEmail, subject, html });
  },

  verifyConnection: _verifyConnectionInProcess,
};

// Use remote proxy when EMAIL_SERVICE_URL is configured, otherwise fall back
// to the in-process Resend calls (no docker-compose required for local dev).
export const emailService = EMAIL_SERVICE_URL ? remote : local;

if (EMAIL_SERVICE_URL) {
  logger.info('Email service: using remote microservice', {
    service: 'email',
    url: EMAIL_SERVICE_URL,
  });
} else {
  logger.info(
    'Email service: using in-process Resend (set EMAIL_SERVICE_URL to use microservice)',
    {
      service: 'email',
    }
  );
}

export default emailService;
