import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineQueueService } from '../../src/application/OfflineQueueService.js';

describe('OfflineQueueService', () => {
  let service;
  beforeEach(() => { service = new OfflineQueueService(); });

  describe('enqueue / take', () => {
    it('queues a message', () => {
      service.enqueue('user-1', 'notification:new', { id: '1' });
      const msgs = service.take('user-1');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].event).toBe('notification:new');
    });

    it('returns null for user with no messages', () => {
      expect(service.take('unknown-user')).toBeNull();
    });

    it('atomically clears queue on take', () => {
      service.enqueue('user-1', 'e', {});
      service.take('user-1');
      expect(service.take('user-1')).toBeNull();
    });

    it('caps queue at MAX_QUEUE_SIZE (100)', () => {
      for (let i = 0; i < 110; i++) {
        service.enqueue('user-1', 'e', { i });
      }
      const msgs = service.take('user-1');
      expect(msgs).toHaveLength(100);
    });
  });

  describe('deliver', () => {
    it('emits queued messages to socket', () => {
      const mockSocket = { emit: vi.fn() };
      service.enqueue('user-1', 'notification:new', { text: 'hello' });
      service.deliver(mockSocket, 'user-1');

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      expect(mockSocket.emit).toHaveBeenCalledWith('notification:new', expect.objectContaining({
        text: 'hello', wasQueued: true,
      }));
    });

    it('does nothing if queue is empty', () => {
      const mockSocket = { emit: vi.fn() };
      service.deliver(mockSocket, 'user-1');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('returns 0 when all queues are fresh', () => {
      service.enqueue('user-1', 'e', {});
      service.enqueue('user-2', 'e', {});
      // Both entries are brand-new — nothing stale to remove
      const cleaned = service.cleanup();
      expect(cleaned).toBe(0);
      expect(service.size()).toBe(2);
    });

    it('size() returns correct count', () => {
      service.enqueue('user-1', 'e', {});
      service.enqueue('user-2', 'e', {});
      expect(service.size()).toBe(2);
    });
  });
});
