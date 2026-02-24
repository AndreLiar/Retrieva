/**
 * Port: IEmailSender
 * Defines the contract for email delivery adapters.
 * Adapters implementing this port are placed in infrastructure/adapters/.
 */
export class IEmailSender {
  /**
   * Send a raw email.
   * @param {{ to: string, subject: string, html: string, text?: string }} msg
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string, reason?: string }>}
   */
  async sendRaw(msg) {
    throw new Error('IEmailSender.sendRaw not implemented');
  }

  /**
   * Verify the email provider connectivity.
   * @returns {Promise<boolean>}
   */
  async verify() {
    throw new Error('IEmailSender.verify not implemented');
  }
}
