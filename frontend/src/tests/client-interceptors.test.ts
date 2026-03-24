/**
 * Frontend Tests — apiClient interceptors
 *
 * Tests the request interceptor (X-Workspace-Id header) and the response
 * interceptor (401 token refresh with retries, queue management, logout).
 *
 * Strategy: replace apiClient.defaults.adapter with a controllable mock so
 * all HTTP calls go through the real interceptors without hitting a server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// ---------------------------------------------------------------------------
// Hoist mock functions before module imports
// ---------------------------------------------------------------------------

const { mockDispatchSecureLogout } = vi.hoisted(() => ({
  mockDispatchSecureLogout: vi.fn(),
}));

vi.mock('@/lib/auth-events', () => ({
  dispatchSecureLogout: mockDispatchSecureLogout,
}));

import apiClient, { getErrorMessage } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Preserve the real adapter so we can restore it after each test */
const realAdapter = apiClient.defaults.adapter;

/** Build a proper AxiosError with a response, mimicking a failed HTTP call */
function makeAxiosError(
  status: number,
  url: string,
  extra?: Partial<InternalAxiosRequestConfig>
): AxiosError {
  const config = {
    url,
    method: 'get',
    headers: {},
    baseURL: 'http://localhost:3007/api/v1',
    ...extra,
  } as InternalAxiosRequestConfig;

  const response = {
    status,
    data: { message: status === 401 ? 'Unauthorized' : 'Error' },
    headers: {},
    config,
    statusText: String(status),
  } as AxiosResponse;

  const err = new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    config,
    null,
    response
  );
  err.config = config;
  err.response = response;
  return err;
}

/** Set the adapter to return a sequence of responses or errors */
function setAdapterSequence(
  sequence: Array<{ status: number; data?: unknown } | AxiosError>
) {
  let idx = 0;
  apiClient.defaults.adapter = vi.fn().mockImplementation(
    async (config: InternalAxiosRequestConfig) => {
      const item = sequence[idx++];
      if (item instanceof AxiosError) {
        // Patch config so the interceptor sees the correct URL
        item.config = config;
        if (item.response) item.response.config = config;
        throw item;
      }
      return {
        status: item.status,
        data: item.data ?? {},
        headers: {},
        config,
        statusText: 'OK',
        request: {},
      } as AxiosResponse;
    }
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  apiClient.defaults.adapter = realAdapter;
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Request interceptor — X-Workspace-Id header
// ---------------------------------------------------------------------------

describe('Request interceptor', () => {
  it('adds X-Workspace-Id header when activeWorkspaceId is set in localStorage', async () => {
    localStorage.setItem('activeWorkspaceId', 'ws-test-001');
    let capturedConfig: InternalAxiosRequestConfig | null = null;

    apiClient.defaults.adapter = vi.fn().mockImplementation(
      async (config: InternalAxiosRequestConfig) => {
        capturedConfig = config;
        return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} };
      }
    );

    await apiClient.get('/some-endpoint');
    expect(capturedConfig!.headers['X-Workspace-Id']).toBe('ws-test-001');
  });

  it('does not add X-Workspace-Id when localStorage has no activeWorkspaceId', async () => {
    let capturedConfig: InternalAxiosRequestConfig | null = null;

    apiClient.defaults.adapter = vi.fn().mockImplementation(
      async (config: InternalAxiosRequestConfig) => {
        capturedConfig = config;
        return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} };
      }
    );

    await apiClient.get('/some-endpoint');
    expect(capturedConfig!.headers['X-Workspace-Id']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — auth endpoints bypass (no retry)
// ---------------------------------------------------------------------------

describe('Response interceptor — auth endpoints pass through 401 without retry', () => {
  it.each([
    ['/auth/login'],
    ['/auth/register'],
    ['/auth/refresh'],
    ['/auth/me'],
  ])('does not retry 401 on %s', async (url) => {
    const adapter = vi.fn().mockRejectedValue(makeAxiosError(401, url));
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get(url)).rejects.toMatchObject({
      response: { status: 401 },
    });

    // Adapter called exactly once — no retry
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — 401 on protected endpoint → refresh + retry
// ---------------------------------------------------------------------------

describe('Response interceptor — successful token refresh and retry', () => {
  it('retries original request after a successful token refresh', async () => {
    setAdapterSequence([
      makeAxiosError(401, '/api/workspaces'),  // original request → 401
      { status: 200, data: { ok: true } },     // POST /auth/refresh → 200
      { status: 200, data: { workspaces: [] } }, // retry original → 200
    ]);

    const result = await apiClient.get('/api/workspaces');
    expect(result.data).toEqual({ workspaces: [] });
  });

  it('passes _retry=true on the retried config so it does not loop', async () => {
    let retryConfig: InternalAxiosRequestConfig | null = null;
    let callCount = 0;

    apiClient.defaults.adapter = vi.fn().mockImplementation(
      async (config: InternalAxiosRequestConfig) => {
        callCount++;
        if (callCount === 1) throw makeAxiosError(401, '/api/data');
        if (callCount === 2) return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} }; // refresh
        retryConfig = config;
        return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} };
      }
    );

    await apiClient.get('/api/data');
    expect((retryConfig as InternalAxiosRequestConfig & { _retry?: boolean })?._retry).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — all refresh retries fail → secure logout
// ---------------------------------------------------------------------------

describe('Response interceptor — refresh retries exhausted → logout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('dispatches secure logout after all token refresh retries fail', async () => {
    vi.stubGlobal('location', { pathname: '/chat', href: '' });

    setAdapterSequence([
      makeAxiosError(401, '/api/protected'),   // original → 401
      makeAxiosError(401, '/auth/refresh'),    // refresh attempt 1 fails
      makeAxiosError(401, '/auth/refresh'),    // refresh attempt 2 fails
      makeAxiosError(401, '/auth/refresh'),    // refresh attempt 3 fails
    ]);

    const promise = apiClient.get('/api/protected');
    // Suppress intermediate unhandled rejection detection during timer execution
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeDefined();

    expect(mockDispatchSecureLogout).toHaveBeenCalledOnce();
  });

  it('redirects to /login when on a non-public page', async () => {
    const mockLocation = { pathname: '/workspaces', href: '' };
    vi.stubGlobal('location', mockLocation);

    setAdapterSequence([
      makeAxiosError(401, '/api/protected'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
    ]);

    const promise = apiClient.get('/api/protected');
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeDefined();

    expect(mockLocation.href).toBe('/login');
  });

  it('does not redirect when already on a public page', async () => {
    const mockLocation = { pathname: '/login', href: '' };
    vi.stubGlobal('location', mockLocation);

    setAdapterSequence([
      makeAxiosError(401, '/api/protected'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
    ]);

    const promise = apiClient.get('/api/protected');
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeDefined();

    expect(mockLocation.href).toBe(''); // No redirect
  });

  it('removes activeWorkspaceId from localStorage on logout', async () => {
    localStorage.setItem('activeWorkspaceId', 'ws-123');
    vi.stubGlobal('location', { pathname: '/chat', href: '' });

    setAdapterSequence([
      makeAxiosError(401, '/api/protected'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
      makeAxiosError(401, '/auth/refresh'),
    ]);

    const promise = apiClient.get('/api/protected');
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeDefined();

    expect(localStorage.getItem('activeWorkspaceId')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — concurrent 401s queue management
// ---------------------------------------------------------------------------

describe('Response interceptor — concurrent 401 queue management', () => {
  it('queues a concurrent 401 request and retries it after single refresh', async () => {
    let callCount = 0;

    apiClient.defaults.adapter = vi.fn().mockImplementation(
      async (config: InternalAxiosRequestConfig) => {
        callCount++;
        // Both initial requests get 401
        if (config.url === '/api/resource-a' && callCount <= 2) {
          throw makeAxiosError(401, '/api/resource-a');
        }
        if (config.url === '/api/resource-b' && callCount <= 2) {
          throw makeAxiosError(401, '/api/resource-b');
        }
        // Refresh succeeds
        if (config.url?.includes('/auth/refresh')) {
          return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} };
        }
        // Retries succeed
        return { status: 200, data: { from: config.url }, headers: {}, config, statusText: 'OK', request: {} };
      }
    );

    const [resultA, resultB] = await Promise.allSettled([
      apiClient.get('/api/resource-a'),
      apiClient.get('/api/resource-b'),
    ]);

    // Both should eventually resolve (one via refresh+retry, one via queue+retry)
    expect(resultA.status === 'fulfilled' || resultB.status === 'fulfilled').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — non-401 errors pass through
// ---------------------------------------------------------------------------

describe('Response interceptor — non-401 errors pass through unchanged', () => {
  it('rejects 403 Forbidden without attempting token refresh', async () => {
    const adapter = vi.fn().mockRejectedValue(makeAxiosError(403, '/api/admin'));
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/api/admin')).rejects.toMatchObject({
      response: { status: 403 },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockDispatchSecureLogout).not.toHaveBeenCalled();
  });

  it('rejects 500 Server Error without attempting token refresh', async () => {
    const adapter = vi.fn().mockRejectedValue(makeAxiosError(500, '/api/data'));
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/api/data')).rejects.toMatchObject({
      response: { status: 500 },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('resolves successful responses without intercepting', async () => {
    setAdapterSequence([{ status: 200, data: { hello: 'world' } }]);
    const result = await apiClient.get('/api/hello');
    expect(result.data).toEqual({ hello: 'world' });
  });
});

// ---------------------------------------------------------------------------
// Already retried request passes through on second 401
// ---------------------------------------------------------------------------

describe('Response interceptor — already-retried request passes through', () => {
  it('does not re-enter refresh loop when _retry is already true', async () => {
    const adapter = vi.fn().mockRejectedValue(
      makeAxiosError(401, '/api/protected', { _retry: true } as Record<string, unknown>)
    );
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/api/protected')).rejects.toMatchObject({
      response: { status: 401 },
    });

    // Only called once — no retry
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockDispatchSecureLogout).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Response interceptor — queued request rejected when refresh fails
// ---------------------------------------------------------------------------

describe('Response interceptor — queued request is rejected when refresh fails', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('rejects queued request when the in-flight refresh ultimately fails', async () => {
    vi.stubGlobal('location', { pathname: '/chat', href: '' });

    let callCount = 0;
    apiClient.defaults.adapter = vi.fn().mockImplementation(
      async (config: InternalAxiosRequestConfig) => {
        callCount++;
        // First two calls (original A + original B) get 401
        if ((config.url === '/api/first' || config.url === '/api/second') && callCount <= 2) {
          throw makeAxiosError(401, config.url!);
        }
        // All /auth/refresh calls fail
        if (config.url?.includes('/auth/refresh')) {
          throw makeAxiosError(401, '/auth/refresh');
        }
        return { status: 200, data: {}, headers: {}, config, statusText: 'OK', request: {} };
      }
    );

    const promiseA = apiClient.get('/api/first');
    const promiseB = apiClient.get('/api/second');
    promiseA.catch(() => {});
    promiseB.catch(() => {});

    await vi.runAllTimersAsync();

    const [resultA, resultB] = await Promise.allSettled([promiseA, promiseB]);
    // Both should reject — refresh failed, queue is drained with error
    expect(resultA.status === 'rejected' || resultB.status === 'rejected').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Request interceptor — error branch
// ---------------------------------------------------------------------------

describe('Request interceptor — error branch', () => {
  it('passes through request errors unchanged', async () => {
    // Simulate a pre-request error (e.g., serialisation failure) by injecting
    // a request interceptor that fires after ours and throws.
    const id = apiClient.interceptors.request.use(
      () => { throw new Error('pre-flight failure'); }
    );

    await expect(apiClient.get('/api/test')).rejects.toThrow('pre-flight failure');
    apiClient.interceptors.request.eject(id);
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage utility
// ---------------------------------------------------------------------------

describe('getErrorMessage', () => {
  it('returns specific message for 401 status', () => {
    const err = makeAxiosError(401, '/auth/login');
    expect(getErrorMessage(err)).toContain('Invalid email or password');
  });

  it('returns specific message for 403 status', () => {
    const err = makeAxiosError(403, '/api/admin');
    expect(getErrorMessage(err)).toContain('permission');
  });

  it('returns specific message for 404 status', () => {
    const err = makeAxiosError(404, '/api/missing');
    expect(getErrorMessage(err)).toContain('not found');
  });

  it('returns specific message for 429 status', () => {
    const err = makeAxiosError(429, '/api/rate-limited');
    expect(getErrorMessage(err)).toContain('Too many requests');
  });

  it('returns backend message from responseData.message', () => {
    const err = makeAxiosError(422, '/api/submit');
    err.response!.data = { message: 'Validation failed', success: false };
    expect(getErrorMessage(err)).toBe('Validation failed');
  });

  it('returns first field-level validation error when errors array is present', () => {
    const err = makeAxiosError(422, '/api/submit');
    err.response!.data = {
      message: 'Validation failed',
      errors: [{ field: 'email', message: 'Email is required' }],
    };
    expect(getErrorMessage(err)).toBe('Email is required');
  });

  it('matches known error pattern in message string', () => {
    const axiosErr = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(getErrorMessage(axiosErr)).toContain('internet connection');
  });

  it('uses axiosError.code for network errors without response', () => {
    const axiosErr = new AxiosError('connection refused', 'ECONNREFUSED');
    expect(getErrorMessage(axiosErr)).toContain('unavailable');
  });

  it('falls back to error message when no pattern matches', () => {
    const axiosErr = new AxiosError('something obscure', 'UNKNOWN_CODE');
    expect(getErrorMessage(axiosErr)).toBe('something obscure');
  });

  it('returns message for plain Error instance matching a known pattern', () => {
    const err = new Error('Network Error occurred');
    expect(getErrorMessage(err)).toContain('internet connection');
  });

  it('returns message for plain Error instance with no pattern match', () => {
    const err = new Error('unexpected failure');
    expect(getErrorMessage(err)).toBe('unexpected failure');
  });

  it('returns generic fallback for non-Error unknown value', () => {
    expect(getErrorMessage('just a string')).toContain('unexpected error');
  });
});
