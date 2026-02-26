/**
 * Internal HTTP Client
 *
 * Used for monolith → microservice communication.
 * Every request automatically carries X-Service-Name for distributed tracing.
 *
 * Usage (while service is still in-process, no-op wrapper):
 *   await internalClient.post(process.env.EMAIL_SERVICE_URL, '/send', payload);
 *
 * When the callee is extracted to a separate process the callsite is unchanged —
 * only the service URL env-var needs to point at the new host.
 *
 * @module utils/internalClient
 */

import logger from '../config/logger.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.INTERNAL_REQUEST_TIMEOUT_MS) || 10_000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'monolith';

async function _request(method, url, { body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestHeaders = {
      'Content-Type': 'application/json',
      'X-Service-Name': SERVICE_NAME,
      ...headers,
    };

    // Optional shared secret for securing internal endpoints
    if (process.env.INTERNAL_API_KEY) {
      requestHeaders['X-Internal-Api-Key'] = process.env.INTERNAL_API_KEY;
    }

    const init = { method, headers: requestHeaders, signal: controller.signal };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await fetch(url, init);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(`Internal service responded ${response.status}: ${text}`);
      err.statusCode = response.status;
      throw err;
    }

    const ct = response.headers.get('content-type') || '';
    return ct.includes('application/json') ? response.json() : response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const te = new Error(`Internal request timed out after ${timeoutMs}ms: ${url}`);
      te.code = 'INTERNAL_TIMEOUT';
      throw te;
    }
    throw error;
  }
}

export const internalClient = {
  /**
   * POST to an internal service endpoint.
   *
   * @param {string} baseUrl  - Service base URL from env (e.g. process.env.EMAIL_SERVICE_URL)
   * @param {string} path     - Endpoint path (e.g. '/send')
   * @param {*}      body     - JSON-serializable request body
   * @param {Object} [options] - { headers, timeoutMs }
   */
  post(baseUrl, path, body, options = {}) {
    const url = `${baseUrl}${path}`;
    logger.debug('Internal POST', { from: SERVICE_NAME, url });
    return _request('POST', url, { body, ...options });
  },

  get(baseUrl, path, options = {}) {
    const url = `${baseUrl}${path}`;
    logger.debug('Internal GET', { from: SERVICE_NAME, url });
    return _request('GET', url, options);
  },

  put(baseUrl, path, body, options = {}) {
    const url = `${baseUrl}${path}`;
    return _request('PUT', url, { body, ...options });
  },

  delete(baseUrl, path, options = {}) {
    const url = `${baseUrl}${path}`;
    return _request('DELETE', url, options);
  },
};

export default internalClient;
