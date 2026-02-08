/**
 * User Model Unit Tests
 *
 * Tests for User model methods and validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../models/User.js';

describe('User Model', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      };

      await User.create(userData);

      // Must fetch user to trigger post-find decryption hook
      // (name field is encrypted at rest)
      const user = await User.findOne({ email: 'test@example.com' });

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('user'); // default
      expect(user.isActive).toBe(true); // default
    });

    it('should hash password before saving', async () => {
      const plainPassword = 'ValidPassword123!';
      const user = await User.create({
        email: 'test@example.com',
        password: plainPassword,
        name: 'Test User',
      });

      // Fetch with password field
      const userWithPassword = await User.findById(user._id).select('+password');

      expect(userWithPassword.password).not.toBe(plainPassword);
      expect(userWithPassword.password).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    });

    it('should lowercase email', async () => {
      await User.create({
        email: 'TEST@EXAMPLE.COM',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const user = await User.findOne({ email: 'test@example.com' });
      expect(user.email).toBe('test@example.com');
    });

    it('should require email', async () => {
      await expect(
        User.create({
          password: 'ValidPassword123!',
          name: 'Test User',
        })
      ).rejects.toThrow();
    });

    it('should require unique email', async () => {
      await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User 1',
      });

      await expect(
        User.create({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          name: 'Test User 2',
        })
      ).rejects.toThrow();
    });

    it('should require password', async () => {
      await expect(
        User.create({
          email: 'test@example.com',
          name: 'Test User',
        })
      ).rejects.toThrow();
    });

    it('should require name', async () => {
      await expect(
        User.create({
          email: 'test@example.com',
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow();
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const plainPassword = 'ValidPassword123!';
      const user = await User.create({
        email: 'test@example.com',
        password: plainPassword,
        name: 'Test User',
      });

      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword.comparePassword(plainPassword);

      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword.comparePassword('WrongPassword!');

      expect(isMatch).toBe(false);
    });
  });

  describe('Login Attempts', () => {
    it('should increment login attempts', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.incLoginAttempts();

      const updated = await User.findById(user._id).select('+loginAttempts');
      expect(updated.loginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      let user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      // Simulate 5 failed attempts - must refetch user each time
      // because incLoginAttempts uses updateOne which doesn't update local instance
      for (let i = 0; i < 5; i++) {
        user = await User.findById(user._id).select('+loginAttempts +lockUntil');
        await user.incLoginAttempts();
      }

      const updated = await User.findById(user._id).select('+loginAttempts +lockUntil');
      expect(updated.loginAttempts).toBe(5);
      expect(updated.lockUntil).toBeDefined();
      expect(updated.isLocked).toBe(true);
    });

    it('should reset login attempts on success', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
        loginAttempts: 3,
      });

      await user.resetLoginAttempts();

      const updated = await User.findById(user._id).select('+loginAttempts +lastLogin');
      expect(updated.loginAttempts).toBe(0);
      expect(updated.lastLogin).toBeDefined();
    });
  });

  describe('Password Reset Token', () => {
    it('should create password reset token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const rawToken = await user.createPasswordResetToken();

      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(64); // 32 bytes = 64 hex chars

      const updated = await User.findById(user._id).select(
        '+passwordResetToken +passwordResetExpires'
      );
      expect(updated.passwordResetToken).toBeDefined();
      expect(updated.passwordResetExpires).toBeDefined();
      expect(updated.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('should verify valid reset token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const rawToken = await user.createPasswordResetToken();

      const updated = await User.findById(user._id).select(
        '+passwordResetToken +passwordResetExpires'
      );
      const isValid = updated.verifyPasswordResetToken(rawToken);

      expect(isValid).toBe(true);
    });

    it('should reject invalid reset token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.createPasswordResetToken();

      const updated = await User.findById(user._id).select(
        '+passwordResetToken +passwordResetExpires'
      );
      const isValid = updated.verifyPasswordResetToken('invalid-token');

      expect(isValid).toBe(false);
    });

    it('should clear reset token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.createPasswordResetToken();
      await user.clearPasswordResetToken();

      const updated = await User.findById(user._id).select(
        '+passwordResetToken +passwordResetExpires'
      );
      expect(updated.passwordResetToken).toBeUndefined();
      expect(updated.passwordResetExpires).toBeUndefined();
    });
  });

  describe('Email Verification Token', () => {
    it('should create email verification token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const rawToken = await user.createEmailVerificationToken();

      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(64);

      const updated = await User.findById(user._id).select(
        '+emailVerificationToken +emailVerificationExpires'
      );
      expect(updated.emailVerificationToken).toBeDefined();
      expect(updated.emailVerificationExpires).toBeDefined();
      expect(updated.emailVerificationLastSentAt).toBeInstanceOf(Date);
    });

    it('should verify email with valid token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
        isEmailVerified: false,
      });

      const rawToken = await user.createEmailVerificationToken();

      const updated = await User.findById(user._id).select(
        '+emailVerificationToken +emailVerificationExpires'
      );
      const verified = await updated.verifyEmail(rawToken);

      expect(verified).toBe(true);

      const final = await User.findById(user._id);
      expect(final.isEmailVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.createEmailVerificationToken();

      const updated = await User.findById(user._id).select(
        '+emailVerificationToken +emailVerificationExpires'
      );
      const verified = await updated.verifyEmail('invalid-token');

      expect(verified).toBe(false);
    });
  });

  describe('Refresh Tokens', () => {
    it('should add refresh token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.addRefreshToken('token-hash-123', 'Chrome/Windows');

      const updated = await User.findById(user._id).select('+refreshTokens');
      expect(updated.refreshTokens).toHaveLength(1);
      expect(updated.refreshTokens[0].tokenHash).toBe('token-hash-123');
      expect(updated.refreshTokens[0].deviceInfo).toBe('Chrome/Windows');
    });

    it('should limit to 5 active sessions', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      // Add 6 tokens
      for (let i = 0; i < 6; i++) {
        await user.addRefreshToken(`token-${i}`, `Device-${i}`);
      }

      const updated = await User.findById(user._id).select('+refreshTokens');
      expect(updated.refreshTokens).toHaveLength(5);
    });

    it('should consume refresh token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.addRefreshToken('token-hash-123', 'Chrome/Windows');

      const updated = await User.findById(user._id).select('+refreshTokens');
      const consumed = await updated.consumeRefreshToken('token-hash-123');

      expect(consumed).toBe(true);

      const final = await User.findById(user._id).select('+refreshTokens');
      expect(final.refreshTokens).toHaveLength(0);
    });

    it('should not consume invalid token', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.addRefreshToken('token-hash-123', 'Chrome/Windows');

      const updated = await User.findById(user._id).select('+refreshTokens');
      const consumed = await updated.consumeRefreshToken('invalid-token');

      expect(consumed).toBe(false);
    });

    it('should clear all refresh tokens', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      await user.addRefreshToken('token-1', 'Device-1');
      await user.addRefreshToken('token-2', 'Device-2');

      await user.clearAllRefreshTokens();

      const updated = await User.findById(user._id).select('+refreshTokens');
      expect(updated.refreshTokens).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    it('should exclude sensitive fields', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const json = user.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.refreshTokens).toBeUndefined();
      expect(json.loginAttempts).toBeUndefined();
      expect(json.lockUntil).toBeUndefined();
    });

    it('should include public fields', async () => {
      await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      // Must fetch user to trigger post-find decryption hook
      // (name field is encrypted at rest)
      const user = await User.findOne({ email: 'test@example.com' });
      const json = user.toJSON();

      expect(json.email).toBe('test@example.com');
      expect(json.name).toBe('Test User');
      expect(json.role).toBe('user');
    });
  });

  describe('findByCredentials', () => {
    it('should find user with password included', async () => {
      await User.create({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        name: 'Test User',
      });

      const user = await User.findByCredentials('test@example.com');

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.password).toBeDefined(); // Should include password
    });

    it('should return null for non-existent user', async () => {
      const user = await User.findByCredentials('nonexistent@example.com');

      expect(user).toBeNull();
    });
  });
});
