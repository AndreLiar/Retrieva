import { describe, it, expect } from 'vitest';
import { generateSync } from 'otplib';
import { mfaService } from '../../services/mfaService.js';

describe('mfaService (A1)', () => {
  it('generates a usable TOTP secret and verifies its current code', () => {
    const secret = mfaService.generateSecret();
    expect(typeof secret).toBe('string');
    const code = generateSync({ secret });
    expect(mfaService.verifyTotp(secret, code)).toBe(true);
  });

  it('rejects a wrong / empty code', () => {
    const secret = mfaService.generateSecret();
    expect(mfaService.verifyTotp(secret, '000000')).toBe(false);
    expect(mfaService.verifyTotp(secret, '')).toBe(false);
    expect(mfaService.verifyTotp(null, '123456')).toBe(false);
  });

  it('builds an otpauth URI with the issuer and account', () => {
    const uri = mfaService.keyUri('user@example.com', mfaService.generateSecret());
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('Retrieva');
    expect(uri).toContain('user%40example.com'); // url-encoded @
  });

  it('generates the requested number of recovery codes with matching hashes', () => {
    const { plain, hashed } = mfaService.generateRecoveryCodes(8);
    expect(plain).toHaveLength(8);
    expect(hashed).toHaveLength(8);
    expect(plain[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    expect(mfaService.hashRecoveryCode(plain[0])).toBe(hashed[0]);
  });

  it('hashes recovery codes case-insensitively and trimmed', () => {
    const h = mfaService.hashRecoveryCode('AB12C-DE34F');
    expect(mfaService.hashRecoveryCode('  ab12c-de34f  ')).toBe(h);
  });
});
