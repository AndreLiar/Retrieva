/**
 * Notion Token Monitor Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('axios');
vi.mock('../../config/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../models/NotionWorkspace.js', () => ({
  NotionWorkspace: {
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../models/User.js', () => ({
  User: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../utils/security/encryption.js', () => ({
  decrypt: vi.fn((token) => token), // Return token as-is for testing
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendEmail: vi.fn().mockResolvedValue(true),
  },
}));

import axios from 'axios';
import { NotionWorkspace } from '../../models/NotionWorkspace.js';
import { User } from '../../models/User.js';
import NotionTokenMonitor, {
  TokenStatus,
  notionTokenMonitor,
} from '../../services/notionTokenMonitor.js';

describe('NotionTokenMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Stop monitor if running
    notionTokenMonitor.stop();
  });

  describe('TokenStatus enum', () => {
    it('should have all expected status values', () => {
      expect(TokenStatus.VALID).toBe('valid');
      expect(TokenStatus.EXPIRED).toBe('expired');
      expect(TokenStatus.INVALID).toBe('invalid');
      expect(TokenStatus.REVOKED).toBe('revoked');
      expect(TokenStatus.UNKNOWN).toBe('unknown');
    });
  });

  describe('validateWorkspaceToken', () => {
    const mockWorkspace = {
      _id: 'workspace-123',
      workspaceName: 'Test Workspace',
      accessToken: 'encrypted-token',
    };

    it('should return VALID for successful API response', async () => {
      axios.get.mockResolvedValue({ status: 200 });
      NotionWorkspace.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await notionTokenMonitor.validateWorkspaceToken(mockWorkspace);

      expect(result).toBe(TokenStatus.VALID);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.notion.com/v1/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should return EXPIRED for 401 unauthorized error', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 401,
          data: { code: 'unauthorized' },
        },
      });

      const result = await notionTokenMonitor.validateWorkspaceToken(mockWorkspace);

      expect(result).toBe(TokenStatus.EXPIRED);
    });

    it('should return REVOKED for 403 forbidden error', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 403,
          data: {},
        },
      });

      const result = await notionTokenMonitor.validateWorkspaceToken(mockWorkspace);

      expect(result).toBe(TokenStatus.REVOKED);
    });

    it('should return INVALID for other 4xx errors', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 400,
          data: {},
        },
      });

      const result = await notionTokenMonitor.validateWorkspaceToken(mockWorkspace);

      expect(result).toBe(TokenStatus.INVALID);
    });
  });

  describe('checkAllTokens', () => {
    it('should check all workspaces and return results', async () => {
      const mockWorkspaces = [
        { _id: 'ws1', workspaceName: 'WS1', accessToken: 'token1' },
        { _id: 'ws2', workspaceName: 'WS2', accessToken: 'token2' },
      ];

      NotionWorkspace.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkspaces),
      });
      NotionWorkspace.updateOne.mockResolvedValue({ modifiedCount: 1 });
      axios.get.mockResolvedValue({ status: 200 });

      const results = await notionTokenMonitor.checkAllTokens();

      expect(results.total).toBe(2);
      expect(results.valid).toBe(2);
      expect(results.invalid).toBe(0);
    });

    it('should handle invalid tokens and notify users', async () => {
      const mockWorkspaces = [
        { _id: 'ws1', workspaceName: 'WS1', accessToken: 'token1', userId: 'user1' },
      ];

      const mockUser = {
        _id: 'user1',
        email: 'test@example.com',
        name: 'Test User',
        notionTokenPreference: 'notify',
      };

      NotionWorkspace.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkspaces),
      });
      NotionWorkspace.updateOne.mockResolvedValue({ modifiedCount: 1 });
      User.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      axios.get.mockRejectedValue({
        response: { status: 401, data: { code: 'unauthorized' } },
      });

      const results = await notionTokenMonitor.checkAllTokens();

      expect(results.invalid).toBe(1);
      expect(NotionWorkspace.updateOne).toHaveBeenCalled();
    });
  });

  describe('getUserTokenHealth', () => {
    it('should return token health for all user workspaces', async () => {
      const mockWorkspaces = [
        {
          _id: 'ws1',
          workspaceName: 'WS1',
          tokenStatus: 'valid',
          tokenLastValidated: new Date(),
          syncStatus: 'active',
        },
        {
          _id: 'ws2',
          workspaceName: 'WS2',
          tokenStatus: 'expired',
          tokenLastValidated: new Date(),
          tokenInvalidatedAt: new Date(),
          syncStatus: 'token_expired',
        },
      ];

      NotionWorkspace.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockWorkspaces),
        }),
      });

      const health = await notionTokenMonitor.getUserTokenHealth('user1');

      expect(health).toHaveLength(2);
      expect(health[0].needsReconnect).toBe(false);
      expect(health[1].needsReconnect).toBe(true);
    });
  });

  describe('checkWorkspace', () => {
    it('should check a single workspace and return status', async () => {
      const mockWorkspace = {
        _id: 'ws1',
        workspaceName: 'Test WS',
        accessToken: 'token',
        tokenLastValidated: new Date(),
      };

      NotionWorkspace.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkspace),
      });
      NotionWorkspace.updateOne.mockResolvedValue({ modifiedCount: 1 });
      axios.get.mockResolvedValue({ status: 200 });

      const result = await notionTokenMonitor.checkWorkspace('ws1');

      expect(result.isValid).toBe(true);
      expect(result.status).toBe(TokenStatus.VALID);
    });

    it('should throw error if workspace not found', async () => {
      NotionWorkspace.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(notionTokenMonitor.checkWorkspace('invalid-id')).rejects.toThrow(
        'Workspace not found'
      );
    });
  });

  describe('start/stop', () => {
    it('should start and stop the monitor', () => {
      NotionWorkspace.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });

      notionTokenMonitor.start();
      expect(notionTokenMonitor.isRunning).toBe(true);

      notionTokenMonitor.stop();
      expect(notionTokenMonitor.isRunning).toBe(false);
    });

    it('should not start twice', () => {
      NotionWorkspace.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });

      notionTokenMonitor.start();
      notionTokenMonitor.start(); // Second call should be ignored

      expect(notionTokenMonitor.isRunning).toBe(true);
      notionTokenMonitor.stop();
    });
  });
});
