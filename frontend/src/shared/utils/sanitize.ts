/**
 * Content Sanitization Utility
 *
 * ISSUE #39 FIX: Provides XSS protection for user-generated content
 *
 * Uses DOMPurify for comprehensive HTML sanitization while allowing
 * safe markdown-like formatting.
 */
import DOMPurify from 'dompurify';

/**
 * Sanitization configuration for different content types
 */
const SANITIZE_CONFIG = {
  // Strict mode: Remove all HTML, return plain text
  strict: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  },

  // Message mode: Allow basic formatting but no dangerous tags
  message: {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'pre', 'br', 'p', 'span'],
    ALLOWED_ATTR: ['class'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  },

  // Markdown mode: For rendered markdown content
  markdown: {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'strong', 'em', 'b', 'i', 'u', 's',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
    ADD_ATTR: ['target'], // Allow target for links
  },
};

type SanitizeMode = keyof typeof SANITIZE_CONFIG;

/**
 * Initialize DOMPurify hooks for additional security
 */
function initDOMPurify() {
  if (typeof window === 'undefined') return;

  // Force all links to open in new tab with noopener
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initDOMPurify();
}

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * @param content - The content to sanitize
 * @param mode - Sanitization mode: 'strict' | 'message' | 'markdown'
 * @returns Sanitized content safe for rendering
 */
export function sanitizeContent(content: string, mode: SanitizeMode = 'strict'): string {
  if (!content) return '';

  // Server-side: return escaped content
  if (typeof window === 'undefined') {
    return escapeHtml(content);
  }

  const config = SANITIZE_CONFIG[mode];
  return DOMPurify.sanitize(content, config);
}

/**
 * Escape HTML entities for plain text display
 * Used as fallback for server-side rendering
 *
 * @param text - Text to escape
 * @returns HTML-escaped string
 */
export function escapeHtml(text: string): string {
  if (!text) return '';

  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return text.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Sanitize message content for chat display
 * Uses strict mode by default for maximum security
 *
 * @param content - Message content from API
 * @returns Sanitized content safe for display
 */
export function sanitizeMessageContent(content: string): string {
  // For plain text messages, use strict sanitization
  return sanitizeContent(content, 'strict');
}

/**
 * Check if content contains potentially dangerous patterns
 *
 * @param content - Content to check
 * @returns True if content contains suspicious patterns
 */
export function containsSuspiciousContent(content: string): boolean {
  if (!content) return false;

  const suspiciousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /data:text\/html/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /<form\b/i,
    /expression\s*\(/i, // CSS expression()
    /url\s*\(\s*["']?\s*javascript:/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(content));
}

const sanitize = {
  sanitizeContent,
  sanitizeMessageContent,
  escapeHtml,
  containsSuspiciousContent,
};

export default sanitize;
