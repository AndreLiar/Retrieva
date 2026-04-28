import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types';
// ISSUE #40 FIX: Import secure logout dispatcher
import { dispatchSecureLogout } from '@/shared/lib/auth-events';
import { redirectToLogin, isPublicAuthPath } from '@/shared/lib/navigation';
import { clearActiveWorkspaceContextId, getActiveWorkspaceContextId } from '@/shared/lib/workspace-context';

/**
 * ISSUE #41 FIX: API timeout configuration
 * - Default timeout: 30 seconds for standard API requests
 * - Prevents hanging requests from blocking the UI indefinitely
 */
const API_TIMEOUT_MS = 30000; // 30 seconds

// Create axios instance
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1',
  withCredentials: true, // Important for HTTP-only cookies
  timeout: API_TIMEOUT_MS, // ISSUE #41 FIX: Add default timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track if we're currently refreshing the token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

/**
 * ISSUE #48 FIX: Token refresh retry configuration
 * - Max 3 retry attempts with exponential backoff
 * - Base delay: 1 second, max delay: 8 seconds
 */
const TOKEN_REFRESH_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/**
 * ISSUE #48 FIX: Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  const delay = TOKEN_REFRESH_CONFIG.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.min(delay + jitter, TOKEN_REFRESH_CONFIG.maxDelayMs);
}

/**
 * ISSUE #48 FIX: Sleep helper for backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ISSUE #48 FIX: Attempt token refresh with retries and backoff
 */
async function attemptTokenRefresh(): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < TOKEN_REFRESH_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        await sleep(delay);
      }

      await apiClient.post('/auth/refresh');
      return; // Success
    } catch (error) {
      lastError = error as Error;
    }
  }

  // All retries exhausted
  throw lastError || new Error('Token refresh failed after all retries');
}

const processQueue = (error: Error | null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });
  failedQueue = [];
};

function getWorkspaceIdFromConfig(config: InternalAxiosRequestConfig): string | null {
  const headerWorkspaceId = config.headers?.['X-Workspace-Id'];
  if (typeof headerWorkspaceId === 'string' && headerWorkspaceId.length > 0) {
    return headerWorkspaceId;
  }

  const paramsWorkspaceId =
    config.params && typeof config.params === 'object' && 'workspaceId' in config.params
      ? config.params.workspaceId
      : null;
  if (typeof paramsWorkspaceId === 'string' && paramsWorkspaceId.length > 0) {
    return paramsWorkspaceId;
  }

  const dataWorkspaceId =
    config.data && typeof config.data === 'object' && 'workspaceId' in (config.data as Record<string, unknown>)
      ? (config.data as Record<string, unknown>).workspaceId
      : null;
  if (typeof dataWorkspaceId === 'string' && dataWorkspaceId.length > 0) {
    return dataWorkspaceId;
  }

  return getActiveWorkspaceContextId();
}

// Request interceptor - add workspace header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const workspaceId = getWorkspaceIdFromConfig(config);
    if (workspaceId && config.headers) {
      config.headers['X-Workspace-Id'] = workspaceId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry for auth endpoints or /auth/me (initialization check)
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/register') ||
        originalRequest.url?.includes('/auth/refresh') ||
        originalRequest.url?.includes('/auth/me')
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // ISSUE #48 FIX: Attempt to refresh the token with retries and backoff
        await attemptTokenRefresh();
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);
        // Clear auth state and redirect to login
        if (typeof window !== 'undefined') {
          clearActiveWorkspaceContextId();
          // ISSUE #40 FIX: Dispatch secure logout event with token
          // This prevents malicious scripts from triggering forced logouts
          dispatchSecureLogout();

          // Only redirect if not already on a public page
          const currentPath = window.location.pathname;
          if (!isPublicAuthPath(currentPath)) {
            redirectToLogin();
          }
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

// User-friendly error messages for common scenarios
// ISSUE #41 FIX: Added timeout-specific error messages
const ERROR_MESSAGES: Record<string, string> = {
  'Network Error': 'Unable to connect to the server. Please check your internet connection and try again.',
  'ECONNREFUSED': 'The server is currently unavailable. Please try again in a few moments.',
  'ETIMEDOUT': 'The request timed out. Please check your connection and try again.',
  'ENOTFOUND': 'Unable to reach the server. Please check your internet connection.',
  'ERR_NETWORK': 'Network error. Please check your internet connection and try again.',
  'ECONNABORTED': 'The request timed out. The server may be busy - please try again.',
  'timeout of': 'The request timed out. Please check your connection and try again.',
  'Request failed with status code 500': 'Something went wrong on our end. Please try again later.',
  'Request failed with status code 502': 'The server is temporarily unavailable. Please try again in a few moments.',
  'Request failed with status code 503': 'The service is temporarily unavailable. Please try again later.',
  'Request failed with status code 504': 'The server took too long to respond. Please try again.',
};

// Helper function to extract error message from API response
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>;

    // Check for specific HTTP status codes
    const status = axiosError.response?.status;
    if (status === 401) {
      return 'Invalid email or password. Please try again.';
    }
    if (status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (status === 404) {
      return 'The requested resource was not found.';
    }
    if (status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    // Check for backend error message with field-level validation errors
    const responseData = axiosError.response?.data;
    if (responseData?.message) {
      // If there are detailed validation errors, include the first field message
      const errors = (responseData as unknown as Record<string, unknown>).errors;
      if (Array.isArray(errors) && errors.length > 0 && errors[0]?.message) {
        return errors[0].message;
      }
      return responseData.message;
    }

    // Check for known error patterns and return user-friendly message
    const errorMsg = axiosError.message || '';
    for (const [pattern, friendlyMessage] of Object.entries(ERROR_MESSAGES)) {
      if (errorMsg.includes(pattern)) {
        return friendlyMessage;
      }
    }

    // Check for network errors without response
    if (!axiosError.response && axiosError.code) {
      const friendlyMessage = ERROR_MESSAGES[axiosError.code];
      if (friendlyMessage) {
        return friendlyMessage;
      }
    }

    // Fallback
    return errorMsg || 'An error occurred. Please try again.';
  }

  if (error instanceof Error) {
    // Check for known error patterns
    for (const [pattern, friendlyMessage] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.includes(pattern)) {
        return friendlyMessage;
      }
    }
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
