/**
 * MFA (TOTP) service — audit gap A1.
 *
 * Thin wrapper around otplib's TOTP functions (RFC 6238) plus recovery-code
 * generation. Keeps all crypto/format choices in one place so AuthService and
 * tests depend on a small, stable surface.
 */

import crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { sha256 } from '../utils/security/crypto.js';

// Allow ±1 step (±30s) of clock drift between server and authenticator app.
// otplib v13 expresses drift as a time tolerance in seconds (the period is 30s),
// replacing v12's step-based `window: 1`.
const EPOCH_TOLERANCE_SECONDS = 30;

const ISSUER = process.env.MFA_ISSUER || 'Retrieva';
const RECOVERY_CODE_COUNT = 10;

export const mfaService = {
  /** Generate a new base32 TOTP secret. */
  generateSecret() {
    return generateSecret();
  },

  /**
   * Build the otpauth:// URI an authenticator app scans (or that the frontend
   * renders as a QR code).
   */
  keyUri(accountName, secret) {
    return generateURI({ issuer: ISSUER, label: accountName, secret });
  },

  /** Verify a 6-digit TOTP code against a secret. */
  verifyTotp(secret, token) {
    if (!secret || !token) return false;
    try {
      return verifySync({
        token: String(token).trim(),
        secret,
        epochTolerance: EPOCH_TOLERANCE_SECONDS,
      }).valid;
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
