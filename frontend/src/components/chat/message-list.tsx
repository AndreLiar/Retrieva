'use client';

import { useEffect, useRef } from 'react';
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

  // Auto-scroll to bottom when new messages arrive or streaming content updates
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
    return null; // Empty state is handled by parent
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            onFeedback={
              message.role === 'assistant' && onFeedback
                ? (feedback) => onFeedback(message.id, feedback)
                : undefined
            }
            onRegenerate={
              message.role === 'assistant' &&
              onRegenerate &&
              index === messages.length - 1
                ? () => onRegenerate(message.id)
                : undefined
            }
          />
        ))}

        {/* Streaming message */}
        {isStreaming && (
          <StreamingMessage
            content={streamingContent || ''}
            status={streamingStatus}
            sources={streamingSources}
          />
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageSkeleton({ isUser }: { isUser: boolean }) {
  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className={`space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <Skeleton className="h-16 w-64 rounded-2xl" />
      </div>
    </div>
  );
}
