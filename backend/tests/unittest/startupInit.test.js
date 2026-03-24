/**
 * Unit tests — services/startupInit.js
 *
 * StartupInitService has one method: initialize()
 * It logs an info message. We verify the class shape and the log call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock logger before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import logger from '../../config/logger.js';
import { StartupInitService, startupInitService } from '../../services/startupInit.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StartupInitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('class shape', () => {
    it('exports a class named StartupInitService', () => {
      expect(StartupInitService).toBeTypeOf('function');
    });

    it('has an initialize method', () => {
      const instance = new StartupInitService();
      expect(instance.initialize).toBeTypeOf('function');
    });
  });

  describe('initialize()', () => {
    it('resolves without throwing', async () => {
      const service = new StartupInitService();
      await expect(service.initialize()).resolves.toBeUndefined();
    });

    it('calls logger.info with startup message', async () => {
      const service = new StartupInitService();
      await service.initialize();
      expect(logger.info).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith('Startup initialization complete');
    });

    it('does not call logger.error or logger.warn on success', async () => {
      const service = new StartupInitService();
      await service.initialize();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('can be called multiple times independently', async () => {
      const service = new StartupInitService();
      await service.initialize();
      await service.initialize();
      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('default export (singleton)', () => {
    it('is an instance of StartupInitService', () => {
      expect(startupInitService).toBeInstanceOf(StartupInitService);
    });

    it('singleton initialize() also logs the startup message', async () => {
      await startupInitService.initialize();
      expect(logger.info).toHaveBeenCalledWith('Startup initialization complete');
    });
  });
});
