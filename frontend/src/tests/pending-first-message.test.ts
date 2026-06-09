import { describe, it, expect } from 'vitest';
import {
  setPendingFirstMessage,
  takePendingFirstMessage,
} from '@/features/chat/lib/pending-first-message';

describe('pending-first-message handoff (#397)', () => {
  it('returns the stashed message for the matching conversation', () => {
    setPendingFirstMessage({ conversationId: 'c1', question: 'hello', workspaceId: 'ws1' });
    const taken = takePendingFirstMessage('c1');
    expect(taken).toEqual({ conversationId: 'c1', question: 'hello', workspaceId: 'ws1' });
  });

  it('is taken exactly once (guards StrictMode double-invoke)', () => {
    setPendingFirstMessage({ conversationId: 'c2', question: 'q', workspaceId: null });
    expect(takePendingFirstMessage('c2')).not.toBeNull();
    expect(takePendingFirstMessage('c2')).toBeNull();
  });

  it('does not return (nor clear) a message for a different conversation', () => {
    setPendingFirstMessage({ conversationId: 'c3', question: 'q', workspaceId: null });
    expect(takePendingFirstMessage('other')).toBeNull();
    // still available for the right id
    expect(takePendingFirstMessage('c3')).not.toBeNull();
  });

  it('returns null when nothing is pending', () => {
    // c3 was consumed above; no pending message remains
    expect(takePendingFirstMessage('anything')).toBeNull();
  });
});
