/**
 * Frontend Tests — conversationsApi client
 *
 * All tests mock the Axios client so no real HTTP requests are made.
 * Covers all 9 methods: list, get, create, update, delete, bulkDelete,
 * ask, togglePin, submitFeedback, getMessages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing conversationsApi
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

import { conversationsApi } from '@/lib/api/conversations';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConversation = {
  _id: 'conv-001',
  title: 'Test Conversation',
  workspaceId: 'ws-001',
  isPinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockMessage = {
  id: 'msg-001',
  role: 'assistant',
  content: 'Here is the answer.',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockPagination = { total: 10, limit: 20, skip: 0, hasMore: false };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conversationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list()', () => {
    it('calls GET /conversations without params', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversations: [mockConversation], pagination: mockPagination } },
      });
      await conversationsApi.list();
      expect(mockGet).toHaveBeenCalledWith('/conversations', { params: undefined });
    });

    it('passes page and limit as query params', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversations: [], pagination: mockPagination } },
      });
      await conversationsApi.list({ page: 2, limit: 10 });
      expect(mockGet).toHaveBeenCalledWith('/conversations', { params: { page: 2, limit: 10 } });
    });

    it('passes pinned filter as query param', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversations: [], pagination: mockPagination } },
      });
      await conversationsApi.list({ pinned: true });
      expect(mockGet).toHaveBeenCalledWith('/conversations', { params: { pinned: true } });
    });

    it('returns conversations and pagination', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversations: [mockConversation], pagination: mockPagination } },
      });
      const result = await conversationsApi.list();
      expect(result.data.conversations).toHaveLength(1);
      expect(result.data.pagination.total).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('calls GET /conversations/:id', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversation: mockConversation, messages: [] } },
      });
      await conversationsApi.get('conv-001');
      expect(mockGet).toHaveBeenCalledWith('/conversations/conv-001');
    });

    it('returns conversation and messages', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { conversation: mockConversation, messages: [mockMessage] } },
      });
      const result = await conversationsApi.get('conv-001');
      expect(result.data.conversation._id).toBe('conv-001');
      expect(result.data.messages).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create()', () => {
    it('calls POST /conversations with workspace and optional title', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { conversation: mockConversation } },
      });
      await conversationsApi.create({ workspaceId: 'ws-001', title: 'My Chat' });
      expect(mockPost).toHaveBeenCalledWith('/conversations', {
        workspaceId: 'ws-001',
        title: 'My Chat',
      });
    });

    it('returns the created conversation', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { conversation: mockConversation } },
      });
      const result = await conversationsApi.create({ workspaceId: 'ws-001' });
      expect(result.data.conversation._id).toBe('conv-001');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('calls PATCH /conversations/:id with updated data', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { conversation: { ...mockConversation, title: 'New Title' } } },
      });
      await conversationsApi.update('conv-001', { title: 'New Title' });
      expect(mockPatch).toHaveBeenCalledWith('/conversations/conv-001', { title: 'New Title' });
    });

    it('returns updated conversation', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { conversation: { ...mockConversation, title: 'New Title' } } },
      });
      const result = await conversationsApi.update('conv-001', { title: 'New Title' });
      expect(result.data.conversation.title).toBe('New Title');
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('calls DELETE /conversations/:id', async () => {
      mockDelete.mockResolvedValue({
        data: { status: 'success', data: { deletedId: 'conv-001' } },
      });
      await conversationsApi.delete('conv-001');
      expect(mockDelete).toHaveBeenCalledWith('/conversations/conv-001');
    });

    it('returns the deleted id', async () => {
      mockDelete.mockResolvedValue({
        data: { status: 'success', data: { deletedId: 'conv-001' } },
      });
      const result = await conversationsApi.delete('conv-001');
      expect(result.data.deletedId).toBe('conv-001');
    });
  });

  // -------------------------------------------------------------------------
  // bulkDelete
  // -------------------------------------------------------------------------
  describe('bulkDelete()', () => {
    it('calls POST /conversations/bulk-delete with ids array', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { deletedCount: 2, deletedIds: ['conv-001', 'conv-002'], invalidCount: 0 } },
      });
      await conversationsApi.bulkDelete(['conv-001', 'conv-002']);
      expect(mockPost).toHaveBeenCalledWith('/conversations/bulk-delete', {
        ids: ['conv-001', 'conv-002'],
      });
    });

    it('returns deleted count and ids', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { deletedCount: 2, deletedIds: ['conv-001', 'conv-002'], invalidCount: 0 } },
      });
      const result = await conversationsApi.bulkDelete(['conv-001', 'conv-002']);
      expect(result.data.deletedCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // ask
  // -------------------------------------------------------------------------
  describe('ask()', () => {
    it('calls POST /conversations/:id/ask with the question', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { message: mockMessage, answer: mockMessage } },
      });
      await conversationsApi.ask('conv-001', { question: 'What is DORA?' });
      expect(mockPost).toHaveBeenCalledWith('/conversations/conv-001/ask', {
        question: 'What is DORA?',
      });
    });

    it('returns user message and answer', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { message: mockMessage, answer: mockMessage } },
      });
      const result = await conversationsApi.ask('conv-001', { question: 'What is DORA?' });
      expect(result.data.answer.content).toBe('Here is the answer.');
    });
  });

  // -------------------------------------------------------------------------
  // togglePin
  // -------------------------------------------------------------------------
  describe('togglePin()', () => {
    it('calls PATCH /conversations/:id with isPinned=true', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { conversation: { ...mockConversation, isPinned: true } } },
      });
      await conversationsApi.togglePin('conv-001', true);
      expect(mockPatch).toHaveBeenCalledWith('/conversations/conv-001', { isPinned: true });
    });

    it('calls PATCH /conversations/:id with isPinned=false to unpin', async () => {
      mockPatch.mockResolvedValue({
        data: { status: 'success', data: { conversation: mockConversation } },
      });
      await conversationsApi.togglePin('conv-001', false);
      expect(mockPatch).toHaveBeenCalledWith('/conversations/conv-001', { isPinned: false });
    });
  });

  // -------------------------------------------------------------------------
  // submitFeedback
  // -------------------------------------------------------------------------
  describe('submitFeedback()', () => {
    it('calls POST /conversations/:id/messages/:msgId/feedback', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { message: mockMessage } },
      });
      await conversationsApi.submitFeedback('conv-001', 'msg-001', { feedback: 'positive' });
      expect(mockPost).toHaveBeenCalledWith(
        '/conversations/conv-001/messages/msg-001/feedback',
        { feedback: 'positive' }
      );
    });

    it('supports negative feedback', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { message: mockMessage } },
      });
      await conversationsApi.submitFeedback('conv-001', 'msg-001', { feedback: 'negative' });
      expect(mockPost).toHaveBeenCalledWith(
        '/conversations/conv-001/messages/msg-001/feedback',
        { feedback: 'negative' }
      );
    });

    it('supports null feedback (remove feedback)', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { message: mockMessage } },
      });
      await conversationsApi.submitFeedback('conv-001', 'msg-001', { feedback: null });
      expect(mockPost).toHaveBeenCalledWith(
        '/conversations/conv-001/messages/msg-001/feedback',
        { feedback: null }
      );
    });
  });

  // -------------------------------------------------------------------------
  // getMessages
  // -------------------------------------------------------------------------
  describe('getMessages()', () => {
    it('calls GET /conversations/:id/messages', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { items: [mockMessage], total: 1 } },
      });
      await conversationsApi.getMessages('conv-001');
      expect(mockGet).toHaveBeenCalledWith('/conversations/conv-001/messages', { params: undefined });
    });

    it('passes pagination params', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { items: [], total: 0 } },
      });
      await conversationsApi.getMessages('conv-001', { page: 2, limit: 50 });
      expect(mockGet).toHaveBeenCalledWith('/conversations/conv-001/messages', {
        params: { page: 2, limit: 50 },
      });
    });
  });
});
