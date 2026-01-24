/**
 * Unit Tests for Circuit Breaker
 *
 * Tests the circuit breaker pattern implementation that prevents
 * cascading failures by temporarily stopping requests when error rate is high
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before importing the module
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import CircuitBreaker, { notionCircuitBreaker } from '../../utils/core/circuitBreaker.js';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Constructor tests
  // ============================================================================
  describe('constructor', () => {
    it('should create circuit breaker with default options', () => {
      const cb = new CircuitBreaker();

      expect(cb.failureThreshold).toBe(5);
      expect(cb.successThreshold).toBe(2);
      expect(cb.timeout).toBe(60000);
      expect(cb.windowSize).toBe(10);
      expect(cb.state).toBe('CLOSED');
    });

    it('should accept custom options', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 30000,
        windowSize: 5,
      });

      expect(cb.failureThreshold).toBe(3);
      expect(cb.successThreshold).toBe(1);
      expect(cb.timeout).toBe(30000);
      expect(cb.windowSize).toBe(5);
    });

    it('should initialize in CLOSED state', () => {
      const cb = new CircuitBreaker();
      expect(cb.state).toBe('CLOSED');
    });

    it('should initialize counters to zero', () => {
      const cb = new CircuitBreaker();
      expect(cb.failures).toBe(0);
      expect(cb.successes).toBe(0);
    });
  });

  // ============================================================================
  // execute tests
  // ============================================================================
  describe('execute', () => {
    it('should execute function when circuit is closed', async () => {
      const cb = new CircuitBreaker();
      const fn = vi.fn().mockResolvedValue('result');

      const result = await cb.execute(fn, 'Test API');

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw error when circuit is open', async () => {
      const cb = new CircuitBreaker({ timeout: 60000 });
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() + 60000;

      const fn = vi.fn();

      await expect(cb.execute(fn, 'Test API')).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should include context in error message', async () => {
      const cb = new CircuitBreaker({ timeout: 60000 });
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() + 60000;

      const fn = vi.fn();

      await expect(cb.execute(fn, 'Notion API')).rejects.toThrow('Notion API');
    });

    it('should record success on successful execution', async () => {
      const cb = new CircuitBreaker();
      const fn = vi.fn().mockResolvedValue('result');

      await cb.execute(fn, 'Test API');

      expect(cb.failures).toBe(0);
      expect(cb.recentResults).toContain(true);
    });

    it('should record failure on failed execution', async () => {
      const cb = new CircuitBreaker();
      const fn = vi.fn().mockRejectedValue(new Error('API error'));

      await expect(cb.execute(fn, 'Test API')).rejects.toThrow('API error');

      expect(cb.failures).toBe(1);
      expect(cb.recentResults).toContain(false);
    });

    it('should transition to half-open after timeout expires', async () => {
      const cb = new CircuitBreaker({ timeout: 100 });
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() - 1; // Timeout already expired

      const fn = vi.fn().mockResolvedValue('result');

      await cb.execute(fn, 'Test API');

      // Should have transitioned to HALF_OPEN and then potentially back to CLOSED
      expect(cb.state).not.toBe('OPEN');
    });
  });

  // ============================================================================
  // onSuccess tests
  // ============================================================================
  describe('onSuccess', () => {
    it('should reset failures counter', () => {
      const cb = new CircuitBreaker();
      cb.failures = 3;

      cb.onSuccess('Test API');

      expect(cb.failures).toBe(0);
    });

    it('should add true to recent results', () => {
      const cb = new CircuitBreaker();

      cb.onSuccess('Test API');

      expect(cb.recentResults).toContain(true);
    });

    it('should maintain rolling window size', () => {
      const cb = new CircuitBreaker({ windowSize: 3 });
      cb.recentResults = [true, false, true];

      cb.onSuccess('Test API');

      expect(cb.recentResults.length).toBe(3);
      expect(cb.recentResults).toEqual([false, true, true]);
    });

    it('should close circuit after enough successes in half-open', () => {
      const cb = new CircuitBreaker({ successThreshold: 2 });
      cb.state = 'HALF_OPEN';
      cb.successes = 1;

      cb.onSuccess('Test API');

      expect(cb.state).toBe('CLOSED');
      expect(cb.successes).toBe(0);
    });

    it('should not close circuit until threshold reached', () => {
      const cb = new CircuitBreaker({ successThreshold: 3 });
      cb.state = 'HALF_OPEN';
      cb.successes = 0;

      cb.onSuccess('Test API');

      expect(cb.state).toBe('HALF_OPEN');
      expect(cb.successes).toBe(1);
    });
  });

  // ============================================================================
  // onFailure tests
  // ============================================================================
  describe('onFailure', () => {
    it('should increment failures counter', () => {
      const cb = new CircuitBreaker();

      cb.onFailure('Test API', new Error('test'));

      expect(cb.failures).toBe(1);
    });

    it('should add false to recent results', () => {
      const cb = new CircuitBreaker();

      cb.onFailure('Test API', new Error('test'));

      expect(cb.recentResults).toContain(false);
    });

    it('should open circuit after reaching failure threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      cb.failures = 2;

      cb.onFailure('Test API', new Error('test'));

      expect(cb.state).toBe('OPEN');
    });

    it('should open circuit immediately on failure in half-open', () => {
      const cb = new CircuitBreaker();
      cb.state = 'HALF_OPEN';

      cb.onFailure('Test API', new Error('test'));

      expect(cb.state).toBe('OPEN');
    });

    it('should maintain rolling window size', () => {
      const cb = new CircuitBreaker({ windowSize: 3 });
      cb.recentResults = [true, true, true];

      cb.onFailure('Test API', new Error('test'));

      expect(cb.recentResults.length).toBe(3);
      expect(cb.recentResults).toEqual([true, true, false]);
    });
  });

  // ============================================================================
  // openCircuit tests
  // ============================================================================
  describe('openCircuit', () => {
    it('should set state to OPEN', () => {
      const cb = new CircuitBreaker();

      cb.openCircuit('Test API');

      expect(cb.state).toBe('OPEN');
    });

    it('should set nextAttempt time', () => {
      const cb = new CircuitBreaker({ timeout: 30000 });
      const before = Date.now();

      cb.openCircuit('Test API');

      expect(cb.nextAttempt).toBeGreaterThanOrEqual(before + 30000);
    });
  });

  // ============================================================================
  // getErrorRate tests
  // ============================================================================
  describe('getErrorRate', () => {
    it('should return 0 for empty results', () => {
      const cb = new CircuitBreaker();

      expect(cb.getErrorRate()).toBe(0);
    });

    it('should calculate correct error rate', () => {
      const cb = new CircuitBreaker();
      cb.recentResults = [true, false, true, false, false];

      expect(cb.getErrorRate()).toBe(0.6);
    });

    it('should return 0 for all successes', () => {
      const cb = new CircuitBreaker();
      cb.recentResults = [true, true, true];

      expect(cb.getErrorRate()).toBe(0);
    });

    it('should return 1 for all failures', () => {
      const cb = new CircuitBreaker();
      cb.recentResults = [false, false, false];

      expect(cb.getErrorRate()).toBe(1);
    });
  });

  // ============================================================================
  // getState tests
  // ============================================================================
  describe('getState', () => {
    it('should return current state', () => {
      const cb = new CircuitBreaker();

      const state = cb.getState();

      expect(state.state).toBe('CLOSED');
    });

    it('should include failures count', () => {
      const cb = new CircuitBreaker();
      cb.failures = 2;

      const state = cb.getState();

      expect(state.failures).toBe(2);
    });

    it('should include successes count', () => {
      const cb = new CircuitBreaker();
      cb.successes = 1;

      const state = cb.getState();

      expect(state.successes).toBe(1);
    });

    it('should include error rate', () => {
      const cb = new CircuitBreaker();
      cb.recentResults = [true, false];

      const state = cb.getState();

      expect(state.errorRate).toBe(0.5);
    });

    it('should include nextAttempt when open', () => {
      const cb = new CircuitBreaker({ timeout: 60000 });
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() + 60000;

      const state = cb.getState();

      expect(state.nextAttempt).not.toBeNull();
    });

    it('should return null nextAttempt when closed', () => {
      const cb = new CircuitBreaker();

      const state = cb.getState();

      expect(state.nextAttempt).toBeNull();
    });
  });

  // ============================================================================
  // reset tests
  // ============================================================================
  describe('reset', () => {
    it('should reset state to CLOSED', () => {
      const cb = new CircuitBreaker();
      cb.state = 'OPEN';

      cb.reset();

      expect(cb.state).toBe('CLOSED');
    });

    it('should reset all counters', () => {
      const cb = new CircuitBreaker();
      cb.failures = 5;
      cb.successes = 3;
      cb.recentResults = [true, false, false];

      cb.reset();

      expect(cb.failures).toBe(0);
      expect(cb.successes).toBe(0);
      expect(cb.recentResults).toEqual([]);
    });
  });

  // ============================================================================
  // isOpen tests
  // ============================================================================
  describe('isOpen', () => {
    it('should return false when state is CLOSED', () => {
      const cb = new CircuitBreaker();

      expect(cb.isOpen()).toBe(false);
    });

    it('should return true when OPEN and timeout not expired', () => {
      const cb = new CircuitBreaker();
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() + 60000;

      expect(cb.isOpen()).toBe(true);
    });

    it('should return false when OPEN but timeout expired', () => {
      const cb = new CircuitBreaker();
      cb.state = 'OPEN';
      cb.nextAttempt = Date.now() - 1;

      expect(cb.isOpen()).toBe(false);
    });
  });

  // ============================================================================
  // Integration tests
  // ============================================================================
  describe('integration', () => {
    it('should open circuit after consecutive failures', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      const fn = vi.fn().mockRejectedValue(new Error('API error'));

      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(fn, 'Test API');
        } catch {}
      }

      expect(cb.state).toBe('OPEN');
    });

    it('should transition CLOSED -> OPEN -> HALF_OPEN -> CLOSED', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 50,
      });

      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('success');

      // Cause failures to open circuit
      expect(cb.state).toBe('CLOSED');

      try {
        await cb.execute(failingFn, 'Test');
      } catch {}
      try {
        await cb.execute(failingFn, 'Test');
      } catch {}

      expect(cb.state).toBe('OPEN');

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 60));

      // Should transition to HALF_OPEN and then CLOSED on success
      await cb.execute(successFn, 'Test');

      expect(cb.state).toBe('CLOSED');
    });
  });

  // ============================================================================
  // notionCircuitBreaker singleton tests
  // ============================================================================
  describe('notionCircuitBreaker singleton', () => {
    it('should be an instance of CircuitBreaker', () => {
      expect(notionCircuitBreaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should have configured options for Notion', () => {
      expect(notionCircuitBreaker.failureThreshold).toBe(5);
      expect(notionCircuitBreaker.successThreshold).toBe(2);
      expect(notionCircuitBreaker.timeout).toBe(60000);
      expect(notionCircuitBreaker.windowSize).toBe(10);
    });
  });
});
