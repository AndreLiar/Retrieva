import { describe, it, expect, vi, beforeEach } from 'vitest';

const info = vi.fn();
const warn = vi.fn();
vi.mock('../../config/logger.js', () => ({
  default: { info: (...a) => info(...a), warn: (...a) => warn(...a) },
}));

const { authAuditService } = await import('../../services/authAuditService.js');

describe('authAuditService (A5)', () => {
  beforeEach(() => {
    info.mockReset();
    warn.mockReset();
  });

  it('logs success-type events at info with a structured event name', () => {
    expect(authAuditService.logLoginSuccess({ userId: 'u1' })).toBe(true);
    expect(info).toHaveBeenCalledWith(
      'auth.audit',
      expect.objectContaining({ service: 'auth-audit', event: 'login_success', userId: 'u1' })
    );
  });

  it('logs security-sensitive events at warn', () => {
    authAuditService.logTokenTheftDetected({ userId: 'u1' });
    authAuditService.logLoginFailed({ email: 'x@y.z' });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(info).not.toHaveBeenCalled();
  });

  it('exposes the full event interface used across the app', () => {
    for (const m of [
      'logRegisterSuccess',
      'logLoginSuccess',
      'logLoginFailed',
      'logLoginBlockedLocked',
      'logAccountLocked',
      'logLogout',
      'logPasswordResetRequest',
      'logPasswordResetSuccess',
      'logTokenRefresh',
      'logTokenTheftDetected',
      'logEmailVerified',
    ]) {
      expect(typeof authAuditService[m]).toBe('function');
    }
  });

  it('brute-force detection stubs report not-blocked', async () => {
    expect(await authAuditService.detectBruteForce()).toEqual({ blocked: false });
    expect(await authAuditService.checkBruteForce()).toEqual({ blocked: false });
    expect(await authAuditService.isBlocked()).toBe(false);
  });
});
