/**
 * Email Service
 *
 * Handles sending emails using Nodemailer with Gmail SMTP
 * - Workspace invitation emails
 * - Welcome emails
 * - Notification emails
 *
 * @module services/emailService
 */

import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

/**
 * Email configuration from environment variables
 */
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  from: {
    name: process.env.SMTP_FROM_NAME || 'RAG Platform',
    email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
  },
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Create Nodemailer transporter
 */
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
      logger.warn('Email service not configured - missing SMTP credentials', {
        service: 'email',
        hasUser: !!EMAIL_CONFIG.auth.user,
        hasPass: !!EMAIL_CONFIG.auth.pass,
      });
      return null;
    }

    // Auto-correct secure flag based on port to prevent misconfiguration:
    //   Port 465 → always use direct TLS (secure: true)
    //   Port 587 → always use STARTTLS (secure: false, Nodemailer upgrades automatically)
    //   Other ports → use env var as-is
    let secure = EMAIL_CONFIG.secure;
    if (EMAIL_CONFIG.port === 465) {
      secure = true;
    } else if (EMAIL_CONFIG.port === 587) {
      secure = false;
    }

    if (secure !== EMAIL_CONFIG.secure) {
      logger.warn('Auto-corrected SMTP_SECURE based on port', {
        service: 'email',
        port: EMAIL_CONFIG.port,
        configuredSecure: EMAIL_CONFIG.secure,
        correctedSecure: secure,
      });
    }

    transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure,
      auth: EMAIL_CONFIG.auth,
    });

    logger.info('Email transporter created', {
      service: 'email',
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure,
    });
  }
  return transporter;
}

/**
 * Send an email
 *
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    logger.warn('Email not sent - transporter not configured', { to, subject });
    return { success: false, reason: 'Email service not configured' };
  }

  try {
    const info = await transport.sendMail({
      from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.email}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
    });

    logger.info('Email sent successfully', {
      service: 'email',
      messageId: info.messageId,
      to,
      subject,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send email', {
      service: 'email',
      to,
      subject,
      error: error.message,
    });

    return { success: false, error: error.message };
  }
}

/**
 * Send workspace invitation email
 *
 * @param {Object} params - Invitation parameters
 * @param {string} params.toEmail - Invitee's email
 * @param {string} params.toName - Invitee's name
 * @param {string} params.inviterName - Inviter's name
 * @param {string} params.workspaceName - Workspace name
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.role - Assigned role
 * @returns {Promise<Object>} - Send result
 */
async function sendWorkspaceInvitation({
  toEmail,
  toName,
  inviterName,
  workspaceName,
  workspaceId,
  role,
}) {
  const workspaceUrl = `${FRONTEND_URL}/workspaces/${workspaceId}`;

  const subject = `${inviterName} invited you to "${workspaceName}"`;

  const html = `
<!DOCTYPE html>
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

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${toName || 'there'},
    </p>

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
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;">
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
      This invitation was sent by ${inviterName} via RAG Platform.<br>
      If you didn't expect this email, you can safely ignore it.
    </p>

  </div>

</body>
</html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send welcome email to new users
 *
 * @param {Object} params - Welcome parameters
 * @param {string} params.toEmail - User's email
 * @param {string} params.toName - User's name
 * @returns {Promise<Object>} - Send result
 */
async function sendWelcomeEmail({ toEmail, toName }) {
  const subject = 'Welcome to RAG Platform!';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to RAG Platform!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${toName || 'there'},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your account has been created successfully. Here's how to get started:
    </p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151;">Getting Started</h3>

      <div style="margin-bottom: 15px;">
        <strong style="color: #667eea;">1. Connect Notion</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
          Link your Notion workspace to sync your documents.
        </p>
      </div>

      <div style="margin-bottom: 15px;">
        <strong style="color: #667eea;">2. Sync Documents</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
          Choose which pages and databases to index.
        </p>
      </div>

      <div>
        <strong style="color: #667eea;">3. Start Asking</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
          Ask questions and get AI-powered answers from your docs.
        </p>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${FRONTEND_URL}/dashboard"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;">
        Go to Dashboard
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      Need help? Reply to this email or check our documentation.
    </p>

  </div>

</body>
</html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send password reset email
 *
 * @param {Object} params - Reset parameters
 * @param {string} params.toEmail - User's email
 * @param {string} params.toName - User's name
 * @param {string} params.resetToken - Password reset token
 * @returns {Promise<Object>} - Send result
 */
async function sendPasswordResetEmail({ toEmail, toName, resetToken }) {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  const subject = 'Reset Your Password';

  const html = `
<!DOCTYPE html>
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

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${toName || 'there'},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      We received a request to reset your password. Click the button below to create a new password:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;">
        Reset Password
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
      This link will expire in 1 hour.
    </p>

    <p style="font-size: 14px; color: #6b7280;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      For security, this request was received from your account.
    </p>

  </div>

</body>
</html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Send email verification email
 *
 * @param {Object} params - Verification parameters
 * @param {string} params.toEmail - User's email
 * @param {string} params.toName - User's name
 * @param {string} params.verificationToken - Email verification token
 * @returns {Promise<Object>} - Send result
 */
async function sendEmailVerification({ toEmail, toName, verificationToken }) {
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const subject = 'Verify Your Email Address';

  const html = `
<!DOCTYPE html>
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

    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi ${toName || 'there'},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thanks for signing up! Please verify your email address by clicking the button below:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}"
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;">
        Verify Email
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
      This link will expire in 24 hours.
    </p>

    <p style="font-size: 14px; color: #6b7280;">
      If you didn't create an account, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      This email was sent by RAG Platform.
    </p>

  </div>

</body>
</html>
  `;

  return sendEmail({ to: toEmail, subject, html });
}

/**
 * Verify email configuration
 *
 * @returns {Promise<boolean>} - Whether config is valid
 */
async function verifyConnection() {
  const transport = getTransporter();

  if (!transport) {
    return false;
  }

  try {
    await transport.verify();
    logger.info('Email service connection verified', { service: 'email' });
    return true;
  } catch (error) {
    logger.error('Email service connection failed', {
      service: 'email',
      error: error.message,
    });
    return false;
  }
}

// Export service
export const emailService = {
  sendEmail,
  sendWorkspaceInvitation,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyConnection,
};

export default emailService;
