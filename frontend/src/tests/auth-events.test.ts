/**
 * Auth Events Unit Tests
 *
 * Tests for secure auth event utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AUTH_EVENT_CONFIG,
  dispatchSecureLogout,
  validateLogoutEvent,
} from '@/lib/auth-events';

describe('Auth Events', () => {
  // ===========================================================================
  // AUTH_EVENT_CONFIG Tests
  // ===========================================================================
  describe('AUTH_EVENT_CONFIG', () => {
    it('should have correct event name', () => {
      expect(AUTH_EVENT_CONFIG.eventName).toBe('auth:logout');
    });

    it('should have getToken function', () => {
      expect(typeof AUTH_EVENT_CONFIG.getToken).toBe('function');
    });

    it('should return consistent token on multiple calls', () => {
      const token1 = AUTH_EVENT_CONFIG.getToken();
      const token2 = AUTH_EVENT_CONFIG.getToken();
      expect(token1).toBe(token2);
    });

    it('should return a non-empty string token', () => {
      const token = AUTH_EVENT_CONFIG.getToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // dispatchSecureLogout Tests
  // ===========================================================================
  describe('dispatchSecureLogout', () => {
    let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    });

    it('should dispatch CustomEvent with correct event name', () => {
      dispatchSecureLogout();

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('auth:logout');
    });

    it('should include security token in event detail', () => {
      dispatchSecureLogout();

      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent<{ token: string }>;
      expect(event.detail).toHaveProperty('token');
      expect(event.detail.token).toBe(AUTH_EVENT_CONFIG.getToken());
    });

    it('should dispatch event that can be validated', () => {
      dispatchSecureLogout();

      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent<{ token: string }>;
      expect(validateLogoutEvent(event)).toBe(true);
    });
  });

  // ===========================================================================
  // validateLogoutEvent Tests
  // ===========================================================================
  describe('validateLogoutEvent', () => {
    it('should return true for valid token', () => {
      const validEvent = new CustomEvent('auth:logout', {
        detail: { token: AUTH_EVENT_CONFIG.getToken() },
      });

      expect(validateLogoutEvent(validEvent)).toBe(true);
    });

    it('should return false for invalid token', () => {
      const invalidEvent = new CustomEvent('auth:logout', {
        detail: { token: 'invalid-token-12345' },
      });

      expect(validateLogoutEvent(invalidEvent)).toBe(false);
    });

    it('should return false for missing token', () => {
      const noTokenEvent = new CustomEvent('auth:logout', {
        detail: {},
      });

      expect(validateLogoutEvent(noTokenEvent as CustomEvent<{ token?: string }>)).toBe(false);
    });

    it('should return false for undefined detail', () => {
      const noDetailEvent = new CustomEvent('auth:logout');

      expect(validateLogoutEvent(noDetailEvent as CustomEvent<{ token?: string }>)).toBe(false);
    });

    it('should return false for null token', () => {
      const nullTokenEvent = new CustomEvent('auth:logout', {
        detail: { token: null },
      });

      expect(validateLogoutEvent(nullTokenEvent as CustomEvent<{ token?: string }>)).toBe(false);
    });

    it('should return false for empty string token', () => {
      const emptyTokenEvent = new CustomEvent('auth:logout', {
        detail: { token: '' },
      });

      expect(validateLogoutEvent(emptyTokenEvent)).toBe(false);
    });
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================
  describe('Security', () => {
    it('should generate unique tokens (not predictable)', () => {
      const token = AUTH_EVENT_CONFIG.getToken();

      // Token should not be a simple predictable value
      expect(token).not.toBe('token');
      expect(token).not.toBe('auth');
      expect(token).not.toBe('logout');
    });

    it('should reject events from malicious scripts with guessed tokens', () => {
      const maliciousEvents = [
        new CustomEvent('auth:logout', { detail: { token: 'guessed-token' } }),
        new CustomEvent('auth:logout', { detail: { token: '12345' } }),
        new CustomEvent('auth:logout', { detail: { token: 'auth_token' } }),
        new CustomEvent('auth:logout', { detail: { token: crypto.randomUUID() } }),
      ];

      maliciousEvents.forEach((event) => {
        expect(validateLogoutEvent(event)).toBe(false);
      });
    });

    it('should only accept the exact token', () => {
      const correctToken = AUTH_EVENT_CONFIG.getToken();

      // Slightly modified token should fail
      const modifiedToken = correctToken + 'x';
      const modifiedEvent = new CustomEvent('auth:logout', {
        detail: { token: modifiedToken },
      });

      expect(validateLogoutEvent(modifiedEvent)).toBe(false);
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  describe('Integration', () => {
    it('should work with window event listener', () => {
      let receivedEvent: CustomEvent<{ token: string }> | null = null;
      let isValid = false;

      const handler = (event: Event) => {
        receivedEvent = event as CustomEvent<{ token: string }>;
        isValid = validateLogoutEvent(receivedEvent);
      };

      window.addEventListener('auth:logout', handler);

      dispatchSecureLogout();

      window.removeEventListener('auth:logout', handler);

      expect(receivedEvent).not.toBeNull();
      expect(isValid).toBe(true);
    });

    it('should allow filtering out malicious events', () => {
      const events: { event: CustomEvent; valid: boolean }[] = [];

      const handler = (event: Event) => {
        const customEvent = event as CustomEvent<{ token?: string }>;
        events.push({
          event: customEvent,
          valid: validateLogoutEvent(customEvent),
        });
      };

      window.addEventListener('auth:logout', handler);

      // Dispatch legitimate event
      dispatchSecureLogout();

      // Dispatch malicious event
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: { token: 'malicious-attempt' },
        })
      );

      window.removeEventListener('auth:logout', handler);

      expect(events).toHaveLength(2);
      expect(events[0].valid).toBe(true); // Legitimate
      expect(events[1].valid).toBe(false); // Malicious
    });
  });
});
