/**
 * Application Service — Email
 *
 * Orchestrates email sending use cases.
 * Depends on IEmailSender port (injected via constructor).
 * Contains all HTML template generation (business logic).
 */
export class EmailApplicationService {
  /**
   * @param {{ emailSender: import('../domain/ports/IEmailSender').IEmailSender, frontendUrl: string }} deps
   */
  constructor({ emailSender, frontendUrl }) {
    this._sender = emailSender;
    this._frontendUrl = (frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  }

  async sendEmail({ to, subject, html, text }) {
    return this._sender.sendRaw({ to, subject, html, text });
  }

  async sendWorkspaceInvitation({ toEmail, toName, inviterName, workspaceName, workspaceId, role }) {
    const workspaceUrl = `${this._frontendUrl}/workspaces/${workspaceId}`;
    return this._sender.sendRaw({
      to: toEmail,
      subject: `${inviterName} invited you to "${workspaceName}"`,
      html: this._invitationHtml({ toName, inviterName, workspaceName, role, workspaceUrl }),
    });
  }

  async sendWelcomeEmail({ toEmail, toName }) {
    return this._sender.sendRaw({
      to: toEmail,
      subject: 'Welcome to Retrieva!',
      html: this._welcomeHtml({ toName }),
    });
  }

  async sendPasswordResetEmail({ toEmail, toName, resetToken }) {
    const resetUrl = `${this._frontendUrl}/reset-password?token=${resetToken}`;
    return this._sender.sendRaw({
      to: toEmail,
      subject: 'Reset Your Password',
      html: this._passwordResetHtml({ toName, resetUrl }),
    });
  }

  async sendEmailVerification({ toEmail, toName, verificationToken }) {
    const verifyUrl = `${this._frontendUrl}/verify-email?token=${verificationToken}`;
    return this._sender.sendRaw({
      to: toEmail,
      subject: 'Verify Your Email Address',
      html: this._emailVerificationHtml({ toName, verifyUrl }),
    });
  }

  async verifyConnection() {
    return this._sender.verify();
  }

  // ── HTML Templates (private) ───────────────────────────────────────────────

  _invitationHtml({ toName, inviterName, workspaceName, role, workspaceUrl }) {
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
      <a href="${this._frontendUrl}/register" style="color: #667eea;">create one</a>
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

  _welcomeHtml({ toName }) {
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
      <a href="${this._frontendUrl}/dashboard"
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

  _passwordResetHtml({ toName, resetUrl }) {
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

  _emailVerificationHtml({ toName, verifyUrl }) {
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
}
