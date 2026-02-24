export class HttpEmailClient {
  constructor({ emailServiceUrl, internalApiKey }) {
    this._baseUrl = (emailServiceUrl || '').replace(/\/$/, '');
    this._apiKey = internalApiKey;
  }

  async send({ to, subject, html }) {
    if (!this._baseUrl) {
      console.warn('[HttpEmailClient] EMAIL_SERVICE_URL not set — skipping email');
      return { success: false, reason: 'not-configured' };
    }

    const headers = { 'Content-Type': 'application/json', 'X-Service-Name': 'notification-service' };
    if (this._apiKey) headers['X-Internal-Api-Key'] = this._apiKey;

    try {
      const resp = await fetch(`${this._baseUrl}/internal/email/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to, subject, html }),
        signal: AbortSignal.timeout(10_000),
      });
      return resp.ok ? resp.json() : { success: false, error: `email-service ${resp.status}` };
    } catch (err) {
      console.error('[HttpEmailClient] Email send failed:', err.message);
      return { success: false, error: err.message };
    }
  }
}
