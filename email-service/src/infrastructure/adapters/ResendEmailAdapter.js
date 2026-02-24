/**
 * Infrastructure Adapter: ResendEmailAdapter
 *
 * Implements IEmailSender port using the Resend HTTP API.
 * This is the ONLY file in the service that knows about Resend.
 */
import { Resend } from 'resend';

export class ResendEmailAdapter {
  /**
   * @param {{ apiKey?: string, fromName: string, fromEmail: string }} config
   */
  constructor({ apiKey, fromName, fromEmail }) {
    this._fromName = fromName;
    this._fromEmail = fromEmail;
    this._client = apiKey ? new Resend(apiKey) : null;
  }

  async sendRaw({ to, subject, html, text }) {
    if (!this._client) {
      console.warn(`[ResendEmailAdapter] API key not configured — skipping: ${subject}`);
      return { success: false, reason: 'not-configured' };
    }

    try {
      const { data, error } = await this._client.emails.send({
        from: `${this._fromName} <${this._fromEmail}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });

      if (error) {
        console.error(`[ResendEmailAdapter] Send failed: ${error.message}`);
        return { success: false, error: error.message };
      }

      console.log(`[ResendEmailAdapter] Sent id=${data.id} to=${to}`);
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error(`[ResendEmailAdapter] Exception: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async verify() {
    if (!this._client) return false;
    try {
      await this._client.domains.list();
      return true;
    } catch {
      return false;
    }
  }
}
