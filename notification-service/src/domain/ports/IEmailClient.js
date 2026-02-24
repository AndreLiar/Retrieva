export class IEmailClient {
  /**
   * @param {{ to: string, subject: string, html: string }} payload
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async send(payload) { throw new Error('Not implemented'); }
}
