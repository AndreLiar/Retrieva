/**
 * Authentication audit service (audit gap A5)
 *
 * Emits structured audit events for security-relevant authentication actions
 * (register, login success/failure, lockout, logout, password reset, token
 * refresh, token-theft detection, email verification) so they can be shipped
 * to a SIEM / log pipeline and reviewed.
 *
 * Previously this service was referenced in tests but never implemented. It is
 * logging-based and side-effect-free, so it is safe to call from any auth flow
 * without a datastore or external dependency.
 *
 * Brute-force detection is intentionally a conservative stub that reports
 * "not blocked" — the real enforcement already exists in two layers:
 *   - per-IP: middleware/authRateLimiter.js
 *   - per-account: User model lockout (5 attempts → 2h lock)
 * The hooks are kept here so a future implementation can centralize detection
 * without touching call sites.
 */

import logger from '../config/logger.js';

const SERVICE = 'auth-audit';

function audit(event, ctx = {}, level = 'info') {
  logger[level]('auth.audit', { service: SERVICE, event, ...ctx });
  return true;
}

export const authAuditService = {
  logRegisterSuccess: (ctx) => audit('register_success', ctx),
  logLoginSuccess: (ctx) => audit('login_success', ctx),
  logLoginFailed: (ctx) => audit('login_failed', ctx, 'warn'),
  logLoginBlockedLocked: (ctx) => audit('login_blocked_locked', ctx, 'warn'),
  logAccountLocked: (ctx) => audit('account_locked', ctx, 'warn'),
  logLogout: (ctx) => audit('logout', ctx),
  logPasswordResetRequest: (ctx) => audit('password_reset_request', ctx),
  logPasswordResetSuccess: (ctx) => audit('password_reset_success', ctx),
  logTokenRefresh: (ctx) => audit('token_refresh', ctx),
  logTokenTheftDetected: (ctx) => audit('token_theft_detected', ctx, 'warn'),
  logEmailVerified: (ctx) => audit('email_verified', ctx),

  // Detection stubs — see module note. Always report "not blocked"; the active
  // controls are authRateLimiter (per IP) and the User account lockout.
  detectBruteForce: async () => ({ blocked: false }),
  checkBruteForce: async () => ({ blocked: false }),
  isBlocked: async () => false,
};

export default authAuditService;
