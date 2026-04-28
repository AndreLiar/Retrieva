'use client';

import { useEffect, useRef, memo, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { StreamingMessage } from './streaming-message';
import { Skeleton } from '@/components/ui/skeleton';
import type { Message, Source } from '@/types';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  streamingContent?: string;
  streamingStatus?: string;
  streamingSources?: Source[];
  isStreaming?: boolean;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative' | null) => void;
  onRegenerate?: (messageId: string) => void;
}

// Stable per-message wrapper: bails out when message content and position haven't changed.
// Custom comparator avoids re-renders caused by new callback references from parent.
const MessageItem = memo(
  function MessageItem({
    message,
    isLast,
    onFeedback,
    onRegenerate,
  }: {
    message: Message;
    isLast: boolean;
    onFeedback?: (messageId: string, feedback: 'positive' | 'negative' | null) => void;
    onRegenerate?: (messageId: string) => void;
  }) {
    return (
      <MessageBubble
        message={message}
        onFeedback={
          message.role === 'assistant' && onFeedback
            ? (feedback) => onFeedback(message.id, feedback)
            : undefined
        }
        onRegenerate={
          message.role === 'assistant' && isLast && onRegenerate
            ? () => onRegenerate(message.id)
            : undefined
        }
      />
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.feedback === next.message.feedback &&
    prev.isLast === next.isLast &&
    prev.onFeedback === next.onFeedback &&
    prev.onRegenerate === next.onRegenerate,
);

export function MessageList({
  messages,
  isLoading = false,
  streamingContent,
  streamingStatus,
  streamingSources,
  isStreaming = false,
  onFeedback,
  onRegenerate,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable references so MessageItem's comparator can bail out across renders
  const handleFeedback = useCallback(
    (messageId: string, feedback: 'positive' | 'negative' | null) => {
      onFeedback?.(messageId, feedback);
    },
    [onFeedback],
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      onRegenerate?.(messageId);
    },
    [onRegenerate],
  );

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[...Array(3)].map((_, i) => (
          <MessageSkeleton key={i} isUser={i % 2 === 0} />
        ))}
      </div>
    );
  }

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  const lastIndex = messages.length - 1;

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            isLast={index === lastIndex}
            onFeedback={onFeedback ? handleFeedback : undefined}
            onRegenerate={onRegenerate ? handleRegenerate : undefined}
          />
        ))}

        {isStreaming && (
          <StreamingMessage
            content={streamingContent || ''}
            status={streamingStatus}
            sources={streamingSources}
          />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageSkeleton({ isUser }: { isUser: boolean }) {
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className={`space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <Skeleton className="h-16 w-64 rounded-2xl" />
      </div>
    </div>
  );
}
