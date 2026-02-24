import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresenceApplicationService } from '../../src/application/PresenceApplicationService.js';

function buildService(storeOverrides = {}) {
  const mockStore = {
    setUserPresence: vi.fn().mockResolvedValue(undefined),
    deleteUserPresence: vi.fn().mockResolvedValue(undefined),
    addWorkspaceMember: vi.fn().mockResolvedValue(undefined),
    removeWorkspaceMember: vi.fn().mockResolvedValue(undefined),
    setTypingUser: vi.fn().mockResolvedValue(undefined),
    clearTypingUser: vi.fn().mockResolvedValue(undefined),
    getWorkspaceMembers: vi.fn().mockResolvedValue([]),
    ...storeOverrides,
  };
  return { service: new PresenceApplicationService({ presenceStore: mockStore }), mockStore };
}

describe('PresenceApplicationService', () => {
  describe('userConnected', () => {
    it('marks user online and calls presenceStore.setUserPresence', async () => {
      const { service, mockStore } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: 'alice@test.com' });

      expect(service.isUserOnline('user-1')).toBe(true);
      expect(mockStore.setUserPresence).toHaveBeenCalledWith('user-1', expect.objectContaining({
        status: 'online',
        name: 'Alice',
      }));
    });

    it('handles multiple connections for the same user', async () => {
      const { service } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      await service.userConnected('socket-2', 'user-1', { name: 'Alice', email: '' });
      expect(service.isUserOnline('user-1')).toBe(true);
    });
  });

  describe('userDisconnected', () => {
    it('returns isLastConnection=true when last socket disconnects', async () => {
      const { service } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      const result = await service.userDisconnected('socket-1', 'user-1', { name: 'Alice' });

      expect(result.isLastConnection).toBe(true);
      expect(service.isUserOnline('user-1')).toBe(false);
    });

    it('returns isLastConnection=false when other sockets remain', async () => {
      const { service } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      await service.userConnected('socket-2', 'user-1', { name: 'Alice', email: '' });
      const result = await service.userDisconnected('socket-1', 'user-1', { name: 'Alice' });

      expect(result.isLastConnection).toBe(false);
      expect(service.isUserOnline('user-1')).toBe(true);
    });

    it('calls deleteUserPresence when last connection disconnects', async () => {
      const { service, mockStore } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      await service.userDisconnected('socket-1', 'user-1', { name: 'Alice' });

      expect(mockStore.deleteUserPresence).toHaveBeenCalledWith('user-1');
    });
  });

  describe('isUserOnline', () => {
    it('returns false for unknown user', () => {
      const { service } = buildService();
      expect(service.isUserOnline('unknown-user')).toBe(false);
    });
  });

  describe('joinPresenceWorkspace', () => {
    it('calls addWorkspaceMember and returns members', async () => {
      const members = [{ userId: 'user-2', name: 'Bob' }];
      const { service, mockStore } = buildService({
        getWorkspaceMembers: vi.fn().mockResolvedValue(members),
      });
      const result = await service.joinPresenceWorkspace('user-1', 'ws-1', { name: 'Alice', email: 'a@test.com' });

      expect(mockStore.addWorkspaceMember).toHaveBeenCalledWith('ws-1', 'user-1', expect.objectContaining({
        userId: 'user-1', name: 'Alice', status: 'online',
      }));
      expect(result).toEqual(members);
    });
  });

  describe('leavePresenceWorkspace', () => {
    it('calls removeWorkspaceMember', async () => {
      const { service, mockStore } = buildService();
      await service.leavePresenceWorkspace('user-1', 'ws-1');
      expect(mockStore.removeWorkspaceMember).toHaveBeenCalledWith('ws-1', 'user-1');
    });
  });

  describe('updateStatus', () => {
    it('calls setUserPresence with new status', async () => {
      const { service, mockStore } = buildService();
      await service.updateStatus('user-1', 'away');
      expect(mockStore.setUserPresence).toHaveBeenCalledWith('user-1', expect.objectContaining({
        status: 'away',
      }));
    });

    it('returns presence workspaces for the user', async () => {
      const { service } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      await service.joinPresenceWorkspace('user-1', 'ws-1', { name: 'Alice', email: '' });
      const workspaces = await service.updateStatus('user-1', 'busy');
      expect(workspaces).toBeInstanceOf(Set);
      expect(workspaces.has('ws-1')).toBe(true);
    });
  });

  describe('trackRoom / untrackRoom', () => {
    it('tracks and untracks rooms per socket', async () => {
      const { service } = buildService();
      await service.userConnected('socket-1', 'user-1', { name: 'Alice', email: '' });
      service.trackRoom('socket-1', 'query:abc');
      expect(service.getTrackedRooms('socket-1').has('query:abc')).toBe(true);
      service.untrackRoom('socket-1', 'query:abc');
      expect(service.getTrackedRooms('socket-1').has('query:abc')).toBe(false);
    });
  });
});
