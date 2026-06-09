/**
 * Hands the first message off from the blank `/chat` page to the freshly-created
 * `/conversations/<id>` page across the route change (issue #397).
 *
 * Why: on first send the blank page creates the conversation then navigates, which
 * unmounts it and aborts the in-flight SSE stream — so the message was lost. We
 * instead stash the question here, navigate, and let the (stable) destination page
 * send it on mount. Keyed by conversationId and taken exactly once.
 */
export interface PendingFirstMessage {
  conversationId: string;
  question: string;
  workspaceId: string | null;
}

let pending: PendingFirstMessage | null = null;

export function setPendingFirstMessage(value: PendingFirstMessage): void {
  pending = value;
}

/** Returns and clears the pending message iff it matches this conversation. */
export function takePendingFirstMessage(conversationId: string): PendingFirstMessage | null {
  if (pending && pending.conversationId === conversationId) {
    const value = pending;
    pending = null;
    return value;
  }
  return null;
}
