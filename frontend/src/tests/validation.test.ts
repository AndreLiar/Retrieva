/**
 * Validation Schema Unit Tests
 *
 * Tests for Zod validation schemas used in forms
 */

import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
} from '@/lib/utils/validation';

describe('Validation Schemas', () => {
  // ===========================================================================
  // Login Schema Tests
  // ===========================================================================
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'user@example.com',
        password: 'password123',
      };

      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'password123',
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should reject empty email', () => {
      const invalidData = {
        email: '',
        password: 'password123',
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const invalidData = {
        email: 'user@example.com',
        password: '',
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('password');
      }
    });
  });

  // ===========================================================================
  // Register Schema Tests
  // ===========================================================================
  describe('registerSchema', () => {
    const validData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };

    it('should validate correct registration data', () => {
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject short name', () => {
      const result = registerSchema.safeParse({
        ...validData,
        name: 'J',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should reject name exceeding 100 characters', () => {
      const result = registerSchema.safeParse({
        ...validData,
        name: 'A'.repeat(101),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('less than 100');
      }
    });

    it('should reject password without lowercase letter', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'PASSWORD123',
        confirmPassword: 'PASSWORD123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase');
      }
    });

    it('should reject password without uppercase letter', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase');
      }
    });

    it('should reject password without number', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'PasswordABC',
        confirmPassword: 'PasswordABC',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number');
      }
    });

    it('should reject password without special character', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'Password123',
        confirmPassword: 'Password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('special character');
      }
    });

    it('should reject password shorter than 8 characters', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'Pass1',
        confirmPassword: 'Pass1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('8 characters');
      }
    });

    it('should reject mismatched passwords', () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: 'Password123!',
        confirmPassword: 'Password456',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('do not match');
      }
    });
  });

  // ===========================================================================
  // Forgot Password Schema Tests
  // ===========================================================================
  describe('forgotPasswordSchema', () => {
    it('should validate correct email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'user@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'not-valid',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Reset Password Schema Tests
  // ===========================================================================
  describe('resetPasswordSchema', () => {
    it('should validate correct reset password data', () => {
      const result = resetPasswordSchema.safeParse({
        password: 'NewPassword123!!',
        confirmPassword: 'NewPassword123!!',
      });

      expect(result.success).toBe(true);
    });

    it('should reject weak password', () => {
      const result = resetPasswordSchema.safeParse({
        password: 'weak',
        confirmPassword: 'weak',
      });

      expect(result.success).toBe(false);
    });

    it('should reject mismatched passwords', () => {
      const result = resetPasswordSchema.safeParse({
        password: 'NewPassword123!!',
        confirmPassword: 'DifferentPassword123!!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('do not match');
      }
    });
  });

  // ===========================================================================
  // Change Password Schema Tests
  // ===========================================================================
  describe('changePasswordSchema', () => {
    it('should validate correct change password data', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewPassword123!!',
        confirmPassword: 'NewPassword123!!',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty current password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'NewPassword123!!',
        confirmPassword: 'NewPassword123!!',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('currentPassword');
      }
    });

    it('should reject weak new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'CurrentPass123!',
        newPassword: 'weak',
        confirmPassword: 'weak',
      });

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Create Workspace Schema Tests
  // ===========================================================================
  describe('createWorkspaceSchema', () => {
    it('should validate correct workspace data', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'My Workspace',
        description: 'A workspace for testing',
      });

      expect(result.success).toBe(true);
    });

    it('should accept workspace without description', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'My Workspace',
      });

      expect(result.success).toBe(true);
    });

    it('should reject short workspace name', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'A',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should reject description exceeding 500 characters', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'My Workspace',
        description: 'A'.repeat(501),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500 characters');
      }
    });
  });

  // ===========================================================================
  // Invite Member Schema Tests
  // ===========================================================================
  describe('inviteMemberSchema', () => {
    it('should validate correct invite data with member role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'member@example.com',
        role: 'member',
      });

      expect(result.success).toBe(true);
    });

    it('should validate correct invite data with viewer role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'viewer@example.com',
        role: 'viewer',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'not-an-email',
        role: 'member',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'user@example.com',
        role: 'admin', // admin is not a valid workspace role for invite
      });

      expect(result.success).toBe(false);
    });

    it('should reject owner role in invite', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'user@example.com',
        role: 'owner',
      });

      expect(result.success).toBe(false);
    });
  });
});
