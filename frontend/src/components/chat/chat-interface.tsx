'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChatEmptyState } from '@/features/chat/components/chat-empty-state';
import { useChatSession } from '@/features/chat/hooks/use-chat-session';
import type { Message, Conversation } from '@/types';

interface ChatInterfaceProps {
  conversation?: Conversation;
  messages?: Message[];
  onConversationCreated?: (conversation: Conversation) => void;
  onMessageAdded?: (message: Message) => void;
}

export function ChatInterface({
  conversation,
  messages,
  onConversationCreated,
  onMessageAdded,
}: ChatInterfaceProps) {
  const {
    activeWorkspace,
    canQuery,
    canViewSources,
    localMessages,
    streamingContent,
    streamingStatus,
    streamingSources,
    isStreaming,
    streamingError,
    isLoading,
    hasLastQuestion,
    handleSend,
    handleRetry,
    handleFeedback,
    handleRegenerate,
    stopStreaming,
  } = useChatSession({
    conversation,
    messages,
    onConversationCreated,
    onMessageAdded,
  });

  return (
    <div className="flex h-full flex-col">
      {/* ISSUE #44 FIX: Error alert with retry button */}
      {streamingError && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>{streamingError}</span>
            {hasLastQuestion && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="ml-4 shrink-0"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      {localMessages.length === 0 && !isStreaming ? (
        <ChatEmptyState
          workspaceName={activeWorkspace?.name}
          canQuery={canQuery}
          onExampleClick={handleSend}
        />
      ) : (
        <MessageList
          messages={localMessages}
          isLoading={false}
          streamingContent={streamingContent}
          streamingStatus={streamingStatus}
          streamingSources={canViewSources ? streamingSources : undefined}
          isStreaming={isStreaming}
          onFeedback={handleFeedback}
          onRegenerate={handleRegenerate}
        />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onStop={stopStreaming}
        isLoading={isLoading}
        isStreaming={isStreaming}
        disabled={!canQuery}
        placeholder={
          canQuery
            ? 'Ask a question about your knowledge base...'
            : 'You do not have permission to ask questions'
        }
      />
    </div>
  );
}
