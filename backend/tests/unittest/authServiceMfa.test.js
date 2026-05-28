import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AuthService } from '../../services/AuthService.js';
import { generateMfaToken } from '../../utils/security/jwt.js';

function makeUser(over = {}) {
  return {
    _id: 'u1',
    email: 'u@x.io',
    name: 'User',
    role: 'user',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRecoveryCodes: undefined,
    organizationId: null,
    comparePassword: vi.fn().mockResolvedValue(true),
    addRefreshToken: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    isModified: vi.fn().mockReturnValue(false),
    ...over,
  };
}

function makeSvc() {
  const userRepo = { findById: vi.fn() };
  const organizationRepo = { findById: vi.fn().mockResolvedValue(null) };
  const mfa = {
    generateSecret: vi.fn().mockReturnValue('SECRET'),
    keyUri: vi.fn().mockReturnValue('otpauth://totp/Retrieva:u@x.io'),
    verifyTotp: vi.fn().mockReturnValue(false),
    generateRecoveryCodes: vi.fn().mockReturnValue({ plain: ['a1b2c-d3e4f'], hashed: ['H1'] }),
    hashRecoveryCode: vi.fn((c) => `hash:${c}`),
  };
  const authAudit = { logLoginSuccess: vi.fn(), logLoginFailed: vi.fn() };
  const svc = new AuthService({ userRepo, organizationRepo, mfa, authAudit });
  return { svc, userRepo, organizationRepo, mfa };
}

describe('AuthService MFA (A1)', () => {
  let ctx;
  beforeEach(() => {
    ctx = makeSvc();
  });

  describe('setupMfa', () => {
    it('generates a secret and returns the otpauth URI', async () => {
      const user = makeUser();
      ctx.userRepo.findById.mockResolvedValue(user);
      const res = await ctx.svc.setupMfa('u1');
      expect(res.secret).toBe('SECRET');
      expect(res.otpauthUrl).toContain('otpauth://');
      expect(user.mfaSecret).toBe('SECRET');
      expect(user.save).toHaveBeenCalled();
    });

    it('refuses when MFA is already enabled', async () => {
      ctx.userRepo.findById.mockResolvedValue(makeUser({ mfaEnabled: true }));
      await expect(ctx.svc.setupMfa('u1')).rejects.toThrow('already enabled');
    });
  });

  describe('enableMfa', () => {
    it('rejects an invalid first code', async () => {
      ctx.userRepo.findById.mockResolvedValue(makeUser({ mfaSecret: 'SECRET' }));
      ctx.mfa.verifyTotp.mockReturnValue(false);
      await expect(ctx.svc.enableMfa('u1', '000000')).rejects.toThrow('Invalid verification code');
    });

    it('enables MFA and returns recovery codes on a valid code', async () => {
      const user = makeUser({ mfaSecret: 'SECRET' });
      ctx.userRepo.findById.mockResolvedValue(user);
      ctx.mfa.verifyTotp.mockReturnValue(true);
      const res = await ctx.svc.enableMfa('u1', '123456');
      expect(res.recoveryCodes).toEqual(['a1b2c-d3e4f']);
      expect(user.mfaEnabled).toBe(true);
      expect(user.mfaRecoveryCodes).toEqual(['H1']);
      expect(user.save).toHaveBeenCalled();
    });

    it('requires setup before enable', async () => {
      ctx.userRepo.findById.mockResolvedValue(makeUser({ mfaSecret: null }));
      await expect(ctx.svc.enableMfa('u1', '123456')).rejects.toThrow('Start MFA setup first');
    });
  });

  describe('verifyMfa', () => {
    it('issues a session for a valid challenge token + TOTP code', async () => {
      const user = makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' });
      ctx.userRepo.findById.mockResolvedValue(user);
      ctx.mfa.verifyTotp.mockReturnValue(true);
      const mfaToken = generateMfaToken({ userId: 'u1' });

      const res = await ctx.svc.verifyMfa({ mfaToken, code: '123456', deviceInfo: {} });
      expect(res.user.id).toBe('u1');
      expect(res.tokens.accessToken).toBeTruthy();
      expect(user.addRefreshToken).toHaveBeenCalled();
    });

    it('rejects an invalid code and audits the failure', async () => {
      const user = makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' });
      ctx.userRepo.findById.mockResolvedValue(user);
      ctx.mfa.verifyTotp.mockReturnValue(false);
      const mfaToken = generateMfaToken({ userId: 'u1' });

      await expect(ctx.svc.verifyMfa({ mfaToken, code: '000000', deviceInfo: {} })).rejects.toThrow(
        'Invalid verification code'
      );
    });

    it('accepts and consumes a recovery code when TOTP fails', async () => {
      const user = makeUser({
        mfaEnabled: true,
        mfaSecret: 'SECRET',
        mfaRecoveryCodes: ['hash:rec-ode', 'hash:other'],
        isModified: vi.fn().mockReturnValue(true),
      });
      ctx.userRepo.findById.mockResolvedValue(user);
      ctx.mfa.verifyTotp.mockReturnValue(false); // TOTP fails → recovery path
      const mfaToken = generateMfaToken({ userId: 'u1' });

      const res = await ctx.svc.verifyMfa({ mfaToken, code: 'rec-ode', deviceInfo: {} });
      expect(res.tokens.accessToken).toBeTruthy();
      expect(user.mfaRecoveryCodes).toEqual(['hash:other']); // consumed
      expect(user.save).toHaveBeenCalled();
    });

    it('rejects a tampered/invalid MFA token', async () => {
      await expect(
        ctx.svc.verifyMfa({ mfaToken: 'not-a-token', code: '123456', deviceInfo: {} })
      ).rejects.toThrow('Invalid MFA token');
    });
  });

  describe('disableMfa', () => {
    it('requires a correct password', async () => {
      const user = makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' });
      user.comparePassword.mockResolvedValue(false);
      ctx.userRepo.findById.mockResolvedValue(user);
      await expect(ctx.svc.disableMfa('u1', { password: 'wrong', code: '123456' })).rejects.toThrow(
        'Invalid password'
      );
    });

    it('clears MFA state on valid password + code', async () => {
      const user = makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' });
      ctx.userRepo.findById.mockResolvedValue(user);
      ctx.mfa.verifyTotp.mockReturnValue(true);
      await ctx.svc.disableMfa('u1', { password: 'right', code: '123456' });
      expect(user.mfaEnabled).toBe(false);
      expect(user.mfaSecret).toBeNull();
      expect(user.save).toHaveBeenCalled();
    });
  });
});
