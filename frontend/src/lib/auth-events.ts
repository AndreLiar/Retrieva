/**
 * Secure Auth Event Configuration
 *
 * ISSUE #40 FIX: This module provides a secure mechanism for auth events
 * that prevents malicious scripts from triggering forced logouts.
 *
 * The token is generated at module load time and is only accessible
 * to modules that import from this file (our trusted code).
 */

/**
 * Generate a cryptographically random token for event validation
 * Falls back to Math.random for environments without crypto API
 */
const AUTH_LOGOUT_TOKEN = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `auth_${Date.now()}_${Math.random().toString(36).substring(2)}`;

/**
 * Auth event configuration
 * Used by API client to dispatch events and auth store to validate them
 */
export const AUTH_EVENT_CONFIG = {
  /** Event name for logout */
  eventName: 'auth:logout' as const,
  /** Get the security token (only our code has access to this) */
  getToken: () => AUTH_LOGOUT_TOKEN,
};

/**
 * Dispatch a secure logout event
 * Only call this from trusted code (API interceptors)
 */
export function dispatchSecureLogout(): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(AUTH_EVENT_CONFIG.eventName, {
      detail: { token: AUTH_LOGOUT_TOKEN },
    })
  );
}

/**
 * Validate a logout event's security token
 * @param event - The CustomEvent to validate
 * @returns true if the token is valid
 */
export function validateLogoutEvent(event: CustomEvent<{ token?: string }>): boolean {
  return event.detail?.token === AUTH_LOGOUT_TOKEN;
}

export default AUTH_EVENT_CONFIG;
