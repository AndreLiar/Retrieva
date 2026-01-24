/**
 * Unit Tests for Security Sanitizer Middleware
 *
 * Tests the NoSQL injection and XSS protection middleware
 * Critical for preventing database and client-side attacks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { mongoSanitize, xssClean, securitySanitizer } from '../../middleware/securitySanitizer.js';

describe('Security Sanitizer Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
      query: {},
      params: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  // ============================================================================
  // mongoSanitize middleware tests
  // ============================================================================
  describe('mongoSanitize', () => {
    it('should call next after sanitization', () => {
      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block keys starting with $ in body', () => {
      mockReq.body = {
        username: 'john',
        $gt: 'malicious',
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.username).toBe('john');
      expect(mockReq.body.$gt).toBeUndefined();
    });

    it('should block $where operator', () => {
      mockReq.body = {
        filter: {
          $where: 'function() { return true; }',
        },
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.filter.$where).toBeUndefined();
    });

    it('should block $ne operator', () => {
      mockReq.body = {
        password: { $ne: '' },
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.password.$ne).toBeUndefined();
    });

    it('should block $or operator', () => {
      mockReq.body = {
        $or: [{ admin: true }],
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.$or).toBeUndefined();
    });

    it('should sanitize nested objects', () => {
      mockReq.body = {
        user: {
          profile: {
            $gt: 'injection',
          },
        },
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.user.profile.$gt).toBeUndefined();
    });

    it('should sanitize arrays', () => {
      mockReq.body = {
        items: [{ name: 'safe' }, { $gt: 'injection' }],
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.items[0].name).toBe('safe');
      expect(mockReq.body.items[1].$gt).toBeUndefined();
    });

    it('should replace string values starting with $', () => {
      mockReq.body = {
        field: '$gt',
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.field).toBe('');
    });

    it('should sanitize query parameters', () => {
      mockReq.query = {
        id: '123',
        $ne: 'injection',
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.query.id).toBe('123');
      expect(mockReq.query.$ne).toBeUndefined();
    });

    it('should sanitize URL params', () => {
      mockReq.params = {
        id: '123',
        $gt: 'injection',
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.params.id).toBe('123');
      expect(mockReq.params.$gt).toBeUndefined();
    });

    it('should preserve safe data', () => {
      mockReq.body = {
        email: 'test@example.com',
        name: 'John Doe',
        nested: {
          value: 123,
        },
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.email).toBe('test@example.com');
      expect(mockReq.body.name).toBe('John Doe');
      expect(mockReq.body.nested.value).toBe(123);
    });

    it('should handle null and undefined values', () => {
      mockReq.body = {
        field1: null,
        field2: undefined,
      };

      const middleware = mongoSanitize();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.field1).toBeNull();
      expect(mockReq.body.field2).toBeUndefined();
    });
  });

  // ============================================================================
  // xssClean middleware tests
  // ============================================================================
  describe('xssClean', () => {
    it('should call next after sanitization', () => {
      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should remove script tags', () => {
      mockReq.body = {
        content: 'Hello <script>alert("XSS")</script> World',
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.content).not.toContain('<script>');
    });

    it('should neutralize javascript: URLs', () => {
      mockReq.body = {
        link: 'javascript:alert(1)',
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.link).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      mockReq.body = {
        content: '<img onerror="alert(1)" src="x">',
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.content).not.toContain('onerror=');
    });

    it('should block vbscript: URLs', () => {
      mockReq.body = {
        link: 'vbscript:msgbox(1)',
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.link).not.toContain('vbscript:');
    });

    it('should block data:text/html URLs', () => {
      mockReq.body = {
        content: 'data:text/html,<script>alert(1)</script>',
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.content).not.toContain('data:text/html');
    });

    it('should escape HTML entities in aggressive mode', () => {
      mockReq.body = {
        content: '<div>Hello</div>',
      };

      const middleware = xssClean({ aggressive: true });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.content).toContain('&lt;');
      expect(mockReq.body.content).toContain('&gt;');
    });

    it('should preserve safe content in non-aggressive mode', () => {
      mockReq.body = {
        content: '<div>Hello</div>',
      };

      const middleware = xssClean({ aggressive: false });
      middleware(mockReq, mockRes, mockNext);

      // Without dangerous patterns, non-aggressive mode preserves HTML
      expect(mockReq.body.content).toBe('<div>Hello</div>');
    });

    it('should sanitize nested objects', () => {
      mockReq.body = {
        user: {
          bio: '<script>evil()</script>',
        },
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.user.bio).not.toContain('<script>');
    });

    it('should sanitize arrays', () => {
      mockReq.body = {
        items: ['<script>a</script>', 'safe'],
      };

      const middleware = xssClean();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.items[0]).not.toContain('<script>');
      expect(mockReq.body.items[1]).toBe('safe');
    });
  });

  // ============================================================================
  // securitySanitizer combined middleware tests
  // ============================================================================
  describe('securitySanitizer (combined)', () => {
    it('should call next after sanitization', () => {
      const middleware = securitySanitizer();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should apply both NoSQL and XSS sanitization', () => {
      mockReq.body = {
        $gt: 'nosql-injection',
        content: '<script>xss</script>',
      };

      const middleware = securitySanitizer();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.$gt).toBeUndefined();
      expect(mockReq.body.content).not.toContain('<script>');
    });

    it('should sanitize body, query, and params', () => {
      mockReq.body = { $ne: 'injection' };
      mockReq.query = { $or: 'injection' };
      mockReq.params = { $gt: 'injection' };

      const middleware = securitySanitizer();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.$ne).toBeUndefined();
      expect(mockReq.query.$or).toBeUndefined();
      expect(mockReq.params.$gt).toBeUndefined();
    });

    it('should apply aggressive XSS when configured', () => {
      mockReq.body = {
        content: '<p>Text</p>',
      };

      const middleware = securitySanitizer({ aggressiveXSS: true });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.content).toContain('&lt;');
    });

    it('should handle complex nested attack payload', () => {
      mockReq.body = {
        user: {
          email: 'test@example.com',
          profile: {
            bio: '<script>steal(cookie)</script>',
            settings: {
              $where: 'return true',
            },
          },
        },
        filter: {
          $or: [{ admin: { $ne: false } }],
        },
      };

      const middleware = securitySanitizer();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.body.user.email).toBe('test@example.com');
      expect(mockReq.body.user.profile.bio).not.toContain('<script>');
      expect(mockReq.body.user.profile.settings.$where).toBeUndefined();
      expect(mockReq.body.filter.$or).toBeUndefined();
    });
  });
});
