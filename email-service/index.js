/**
 * Retrieva Email Service
 *
 * Standalone microservice extracted from backend/services/emailService.js.
 * Receives email jobs from the monolith via HTTP and dispatches them through
 * the Resend API.
 *
 * Endpoints (all under /internal/email/):
 *   POST /internal/email/send                 — raw email (to, subject, html)
 *   POST /internal/email/workspace-invitation — invitation template
 *   POST /internal/email/welcome              — welcome template
 *   POST /internal/email/password-reset       — password-reset template
 *   POST /internal/email/email-verification   — email-verification template
 *   POST /internal/email/health               — Resend connectivity check
 *   GET  /health                              — liveness probe
 *
 * Security: set INTERNAL_API_KEY in both this service and the monolith;
 * the monolith's internalClient will forward X-Internal-Api-Key on every call.
 */

import 'dotenv/config';
import express from 'express';
import { Resend } from 'resend';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT) || 3008;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_NAME = process.env.SMTP_FROM_NAME || 'Retrieva';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@retrieva.online';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// ---------------------------------------------------------------------------
// Resend client (lazy singleton)
// ---------------------------------------------------------------------------

let _resend = null;
function getResend() {
  if (!_resend && RESEND_API_KEY) _resend = new Resend(RESEND_API_KEY);
  return _resend;
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

async function sendRaw({ to, subject, html, text }) {
  const client = getResend();

  if (!client) {
    console.warn(`[email-service] RESEND_API_KEY not set — skipping: ${subject}`);
    return { success: false, reason: 'not-configured' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    if (error) {
      console.error(`[email-service] Send failed: ${error.message}`);
      return { success: false, error: error.message };
    }

    console.log(`[email-service] Sent id=${data.id} to=${to} subject="${subject}"`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error(`[email-service] Exception: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '10kb' }));

// Optional internal secret guard
app.use('/internal', (req, res, next) => {
  if (INTERNAL_API_KEY && req.headers['x-internal-api-key'] !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Liveness probe (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'email-service' }));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post('/internal/email/send', async (req, res) => {
  res.json(await sendRaw(req.body));
});

app.post('/internal/email/workspace-invitation', async (req, res) => {
  const { toEmail, toName, inviterName, workspaceName, workspaceId, role } = req.body;
  const workspaceUrl = `${FRONTEND_URL}/workspaces/${workspaceId}`;
  res.json(
    await sendRaw({
      to: toEmail,
      subject: `${inviterName} invited you to "${workspaceName}"`,
      html: invitationHtml({ toName, inviterName, workspaceName, role, workspaceUrl }),
    })
  );
});

app.post('/internal/email/welcome', async (req, res) => {
  const { toEmail, toName } = req.body;
  res.json(await sendRaw({ to: toEmail, subject: 'Welcome to Retrieva!', html: welcomeHtml({ toName }) }));
});

app.post('/internal/email/password-reset', async (req, res) => {
  const { toEmail, toName, resetToken } = req.body;
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  res.json(
    await sendRaw({ to: toEmail, subject: 'Reset Your Password', html: passwordResetHtml({ toName, resetUrl }) })
  );
});

app.post('/internal/email/email-verification', async (req, res) => {
  const { toEmail, toName, verificationToken } = req.body;
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
  res.json(
    await sendRaw({
      to: toEmail,
      subject: 'Verify Your Email Address',
      html: emailVerificationHtml({ toName, verifyUrl }),
    })
  );
});

app.post('/internal/email/health', async (_req, res) => {
  const client = getResend();
  if (!client) return res.json({ connected: false, reason: 'not-configured' });
  try {
    await client.domains.list();
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ─── HTML Templates ───────────────────────────────────────────────────────────

function invitationHtml({ toName, inviterName, workspaceName, role, workspaceUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${toName || 'there'},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${inviterName}</strong> has invited you to join the workspace
      <strong>"${workspaceName}"</strong> as a <strong>${role}</strong>.
    </p>
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 10px 0; color: #374151;">What you can do:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #6b7280;">
        <li>Ask questions about the workspace documents</li>
        <li>Search through synced Notion pages</li>
        <li>Get AI-powered answers with source citations</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${workspaceUrl}"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
        Open Workspace
      </a>
    </div>
    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      If you don't have an account yet, you'll need to
      <a href="${FRONTEND_URL}/register" style="color: #667eea;">create one</a>
      first using this email address.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This invitation was sent by ${inviterName} via Retrieva.<br>
      If you didn't expect this email, you can safely ignore it.
    </p>
  </div>
</body>
</html>`;
}

function welcomeHtml({ toName }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Retrieva!</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${toName || 'there'},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">Your account has been created successfully. Here's how to get started:</p>
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151;">Getting Started</h3>
      <div style="margin-bottom: 15px;">
        <strong style="color: #667eea;">1. Connect Notion</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Link your Notion workspace to sync your documents.</p>
      </div>
      <div style="margin-bottom: 15px;">
        <strong style="color: #667eea;">2. Sync Documents</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Choose which pages and databases to index.</p>
      </div>
      <div>
        <strong style="color: #667eea;">3. Start Asking</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Ask questions and get AI-powered answers from your docs.</p>
      </div>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${FRONTEND_URL}/dashboard"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
        Go to Dashboard
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">Need help? Reply to this email or check our documentation.</p>
  </div>
</body>
</html>`;
}

function passwordResetHtml({ toName, resetUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${toName || 'there'},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      We received a request to reset your password. Click the button below to create a new password:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 14px; color: #6b7280;">This link will expire in 1 hour.</p>
    <p style="font-size: 14px; color: #6b7280;">If you didn't request a password reset, you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">For security, this request was received from your account.</p>
  </div>
</body>
</html>`;
}

function emailVerificationHtml({ toName, verifyUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Verify Your Email</h1>
  </div>
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${toName || 'there'},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">
      Thanks for signing up! Please verify your email address by clicking the button below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
        Verify Email
      </a>
    </div>
    <p style="font-size: 14px; color: #6b7280;">This link will expire in 24 hours.</p>
    <p style="font-size: 14px; color: #6b7280;">If you didn't create an account, you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">This email was sent by Retrieva.</p>
  </div>
</body>
</html>`;
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[email-service] Running on :${PORT}`);
  console.log(`[email-service] Resend configured: ${!!RESEND_API_KEY}`);
});
