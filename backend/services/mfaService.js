/**
 * MFA (TOTP) service — audit gap A1.
 *
 * Thin wrapper around otplib's authenticator (RFC 6238 TOTP) plus recovery-code
 * generation. Keeps all crypto/format choices in one place so AuthService and
 * tests depend on a small, stable surface.
 */

import crypto from 'crypto';
import pkg from 'otplib';
import { sha256 } from '../utils/security/crypto.js';

const { authenticator } = pkg;

// Allow ±1 step (±30s) of clock drift between server and authenticator app.
authenticator.options = { window: 1 };

const ISSUER = process.env.MFA_ISSUER || 'Retrieva';
const RECOVERY_CODE_COUNT = 10;

export const mfaService = {
  /** Generate a new base32 TOTP secret. */
  generateSecret() {
    return authenticator.generateSecret();
  },

  /**
   * Build the otpauth:// URI an authenticator app scans (or that the frontend
   * renders as a QR code).
   */
  keyUri(accountName, secret) {
    return authenticator.keyuri(accountName, ISSUER, secret);
  },

  /** Verify a 6-digit TOTP code against a secret. */
  verifyTotp(secret, token) {
    if (!secret || !token) return false;
    try {
      return authenticator.verify({ token: String(token).trim(), secret });
    } catch {
      return false;
    }
  },

  /**
   * Generate one-time recovery codes. Returns the plaintext codes (shown to the
   * user exactly once) and their hashes (persisted on the user).
   */
  generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
    const plain = [];
    const hashed = [];
    for (let i = 0; i < count; i += 1) {
      // 10 hex chars, grouped as xxxxx-xxxxx for readability.
      const raw = crypto.randomBytes(5).toString('hex');
      const code = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
      plain.push(code);
      hashed.push(this.hashRecoveryCode(code));
    }
    return { plain, hashed };
  },

  /** Hash a recovery code for storage / comparison (normalized, case-insensitive). */
  hashRecoveryCode(code) {
    return sha256(String(code).trim().toLowerCase());
  },
};

export default mfaService;
