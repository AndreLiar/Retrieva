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
  verifyConnection: () => callEmailService('/internal/email/health', {}),
};

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
