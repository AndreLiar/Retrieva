/**
 * Unit Tests for Validators
 *
 * Tests the validation utilities for request data
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isNotEmpty,
  validateQuestion,
  validateChatHistory,
  sanitizeInput,
} from '../../utils/core/validators.js';

describe('Validators', () => {
  // ============================================================================
  // isValidEmail tests
  // ============================================================================
  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.org',
        'user123@subdomain.example.co.uk',
        'test_email@domain.io',
      ];

      for (const email of validEmails) {
        expect(isValidEmail(email)).toBe(true);
      }
    });

    it('should return false for invalid email addresses', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
        'user name@example.com',
        'user@example',
        '',
        null,
        undefined,
      ];

      for (const email of invalidEmails) {
        expect(isValidEmail(email)).toBe(false);
      }
    });
  });

  // ============================================================================
  // isNotEmpty tests
  // ============================================================================
  describe('isNotEmpty', () => {
    it('should return true for non-empty strings', () => {
      expect(isNotEmpty('hello')).toBe(true);
      expect(isNotEmpty('  hello  ')).toBe(true);
      expect(isNotEmpty('0')).toBe(true);
      expect(isNotEmpty('false')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNotEmpty('')).toBe(false);
      expect(isNotEmpty('   ')).toBe(false);
      expect(isNotEmpty('\t\n')).toBe(false);
    });

    it('should return false for non-string types', () => {
      expect(isNotEmpty(null)).toBe(false);
      expect(isNotEmpty(undefined)).toBe(false);
      expect(isNotEmpty(123)).toBe(false);
      expect(isNotEmpty({})).toBe(false);
      expect(isNotEmpty([])).toBe(false);
    });
  });

  // ============================================================================
  // validateQuestion tests
  // ============================================================================
  describe('validateQuestion', () => {
    it('should return valid for proper questions', () => {
      const validQuestions = [
        'What is the capital of France?',
        'How do I use this API?',
        'a',
        'A'.repeat(5000), // Max length
      ];

      for (const question of validQuestions) {
        const result = validateQuestion(question);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should reject null questions', () => {
      const result = validateQuestion(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Question is required');
    });

    it('should reject undefined questions', () => {
      const result = validateQuestion(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Question is required');
    });

    it('should reject non-string questions', () => {
      expect(validateQuestion(123).valid).toBe(false);
      expect(validateQuestion(123).error).toBe('Question must be a string');

      expect(validateQuestion({}).valid).toBe(false);
      expect(validateQuestion([]).valid).toBe(false);
    });

    it('should reject empty string questions', () => {
      const result = validateQuestion('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Question is required');
    });

    it('should reject whitespace-only questions', () => {
      const result = validateQuestion('   \t\n  ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Question cannot be empty');
    });

    it('should reject questions exceeding 5000 characters', () => {
      const longQuestion = 'A'.repeat(5001);
      const result = validateQuestion(longQuestion);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Question is too long (max 5000 characters)');
    });
  });

  // ============================================================================
  // validateChatHistory tests
  // ============================================================================
  describe('validateChatHistory', () => {
    it('should return valid for null (optional field)', () => {
      const result = validateChatHistory(null);
      expect(result.valid).toBe(true);
    });

    it('should return valid for undefined (optional field)', () => {
      const result = validateChatHistory(undefined);
      expect(result.valid).toBe(true);
    });

    it('should return valid for empty array', () => {
      const result = validateChatHistory([]);
      expect(result.valid).toBe(true);
    });

    it('should return valid for properly formatted messages', () => {
      const chatHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];
      const result = validateChatHistory(chatHistory);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array input', () => {
      expect(validateChatHistory('not an array').valid).toBe(false);
      expect(validateChatHistory('not an array').error).toBe('Chat history must be an array');

      expect(validateChatHistory({}).valid).toBe(false);
      expect(validateChatHistory(123).valid).toBe(false);
    });

    it('should reject chat history exceeding 50 messages', () => {
      const longHistory = Array(51).fill({ role: 'user', content: 'message' });
      const result = validateChatHistory(longHistory);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Chat history too long (max 50 messages)');
    });

    it('should reject messages without role', () => {
      const invalidHistory = [{ content: 'Hello' }];
      const result = validateChatHistory(invalidHistory);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Each message must have role and content');
    });

    it('should reject messages without content', () => {
      const invalidHistory = [{ role: 'user' }];
      const result = validateChatHistory(invalidHistory);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Each message must have role and content');
    });

    it('should reject invalid role values', () => {
      const invalidHistory = [{ role: 'system', content: 'Hello' }];
      const result = validateChatHistory(invalidHistory);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message role must be "user" or "assistant"');
    });

    it('should accept exactly 50 messages', () => {
      const maxHistory = Array(50).fill({ role: 'user', content: 'message' });
      const result = validateChatHistory(maxHistory);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // sanitizeInput tests
  // ============================================================================
  describe('sanitizeInput', () => {
    it('should remove MongoDB operator characters', () => {
      expect(sanitizeInput('{"$gt": 1}')).toBe('"gt": 1');
      expect(sanitizeInput('test{injection}')).toBe('testinjection');
    });

    it('should remove $ character', () => {
      expect(sanitizeInput('$where: 1')).toBe('where: 1');
      expect(sanitizeInput('price: $100')).toBe('price: 100');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
      expect(sanitizeInput('\ttest\n')).toBe('test');
    });

    it('should return non-string input unchanged', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
      const obj = { test: 1 };
      expect(sanitizeInput(obj)).toBe(obj);
    });

    it('should handle normal text without changes except trim', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
      expect(sanitizeInput('This is a test question')).toBe('This is a test question');
    });

    it('should remove curly braces from nested injections', () => {
      expect(sanitizeInput('{{nested}}')).toBe('nested');
    });
  });
});
