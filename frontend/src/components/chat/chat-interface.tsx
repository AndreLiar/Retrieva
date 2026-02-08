'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquarePlus, AlertCircle, RefreshCw } from 'lucide-react';

import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStreaming } from '@/lib/hooks/use-streaming';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { conversationsApi } from '@/lib/api';
import type { Message, Conversation } from '@/types';

// Stable empty array to avoid re-renders
const EMPTY_MESSAGES: Message[] = [];

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
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const { canQuery, canViewSources } = usePermissions();

  // Use ref to always get latest canViewSources in callbacks (avoids stale closure)
  const canViewSourcesRef = useRef(canViewSources);
  useEffect(() => {
    canViewSourcesRef.current = canViewSources;
  }, [canViewSources]);

  // Use stable empty array if no messages provided
  const stableMessages = messages ?? EMPTY_MESSAGES;
  const [localMessages, setLocalMessages] = useState<Message[]>(stableMessages);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  // ISSUE #44 FIX: Track last question for retry functionality
  const lastQuestionRef = useRef<{ question: string; conversationId: string } | null>(null);

  // Sync external messages only when they actually change
  useEffect(() => {
    if (stableMessages.length > 0 || localMessages.length > 0) {
      setLocalMessages(stableMessages);
    }
  }, [stableMessages]);

  // ISSUE #47 FIX: Track optimistic user message ID for cleanup on failure
  const optimisticUserMessageIdRef = useRef<string | null>(null);

  // Streaming hook
  const {
    content: streamingContent,
    status: streamingStatus,
    sources: streamingSources,
    isStreaming,
    error: streamingError,
    startStreaming,
    stopStreaming,
  } = useStreaming({
    onComplete: (content, sources) => {
      // Clear optimistic message tracking on success
      optimisticUserMessageIdRef.current = null;

      // Add the completed message to local state
      // Use ref to get latest permission value (avoids stale closure issue)
      const shouldShowSources = canViewSourcesRef.current;
      console.log('[ChatInterface] onComplete - sources check:', {
        sourcesCount: sources?.length,
        canViewSources: shouldShowSources,
        hasUrls: sources?.filter(s => s.url).length,
      });
      const assistantMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: conversation?.id || '',
        role: 'assistant',
        content,
        sources: shouldShowSources ? sources : undefined,
        createdAt: new Date().toISOString(),
        feedback: null,
      };
      setLocalMessages((prev) => [...prev, assistantMessage]);
      onMessageAdded?.(assistantMessage);

      // Invalidate conversation query to refresh from server
      if (conversation?.id) {
        queryClient.invalidateQueries({
          queryKey: ['conversation', conversation.id],
        });
      }
    },
    onError: (error) => {
      // ISSUE #47 FIX: Remove orphaned optimistic user message on failure
      if (optimisticUserMessageIdRef.current) {
        setLocalMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticUserMessageIdRef.current)
        );
        optimisticUserMessageIdRef.current = null;
      }
      toast.error(error);
    },
  });

  // Debug: Track sources and permissions state
  useEffect(() => {
    if (streamingSources && streamingSources.length > 0) {
      console.log('[ChatInterface] Sources available:', {
        canViewSources,
        streamingSourcesCount: streamingSources.length,
        sourcesWithUrls: streamingSources.filter(s => s.url).length,
        willShowSources: canViewSources && streamingSources.length > 0,
      });
    }
  }, [streamingSources, canViewSources]);

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (question: string) => {
      console.log('[ChatInterface] createConversation mutationFn called', {
        question,
        activeWorkspaceId: activeWorkspace?.id,
        activeWorkspaceName: activeWorkspace?.name,
      });
      if (!activeWorkspace) {
        console.error('[ChatInterface] No workspace selected');
        throw new Error('No workspace selected');
      }
      console.log('[ChatInterface] Calling conversationsApi.create...');
      const response = await conversationsApi.create({
        workspaceId: activeWorkspace.id,
        title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
      });
      console.log('[ChatInterface] conversationsApi.create response:', response);
      return response.data?.conversation;
    },
    onSuccess: (newConversation) => {
      console.log('[ChatInterface] Conversation created successfully:', newConversation);
      if (newConversation) {
        onConversationCreated?.(newConversation);
        // Now send the pending question
        if (pendingQuestion) {
          handleSendWithConversation(pendingQuestion, newConversation.id);
          setPendingQuestion(null);
        }
      }
    },
    onError: (error) => {
      console.error('[ChatInterface] Failed to create conversation:', error);
      console.error('[ChatInterface] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast.error('Failed to create conversation');
      setPendingQuestion(null);
    },
  });

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({
      messageId,
      feedback,
    }: {
      messageId: string;
      feedback: 'positive' | 'negative' | null;
    }) => {
      if (!conversation?.id) return;
      await conversationsApi.submitFeedback(conversation.id, messageId, {
        feedback,
      });
    },
    onSuccess: (_, { messageId, feedback }) => {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, feedback } : msg
        )
      );
    },
    onError: () => {
      toast.error('Failed to submit feedback');
    },
  });

  const handleSendWithConversation = useCallback(
    async (question: string, conversationId: string) => {
      // ISSUE #44 FIX: Store last question for retry
      lastQuestionRef.current = { question, conversationId };

      // Add user message to local state
      const messageId = `user-${Date.now()}`;
      const userMessage: Message = {
        id: messageId,
        conversationId,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
        feedback: null,
      };

      // ISSUE #47 FIX: Track optimistic message ID for cleanup on failure
      optimisticUserMessageIdRef.current = messageId;

      setLocalMessages((prev) => [...prev, userMessage]);

      // Start streaming
      startStreaming(question, conversationId);
    },
    [startStreaming]
  );

  // ISSUE #44 FIX: Retry handler for failed streaming requests
  const handleRetry = useCallback(() => {
    if (!lastQuestionRef.current) {
      toast.error('No previous question to retry');
      return;
    }

    const { question, conversationId } = lastQuestionRef.current;

    // Remove the last failed assistant message attempt if any
    setLocalMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      // Only remove if it's an incomplete assistant message
      if (lastMessage?.role === 'assistant' && !lastMessage.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });

    // Retry the streaming request
    startStreaming(question, conversationId);
  }, [startStreaming]);

  const handleSend = useCallback(
    async (question: string) => {
      console.log('[ChatInterface] handleSend called:', {
        question,
        canQuery,
        activeWorkspace: activeWorkspace?.id,
        conversationId: conversation?.id,
      });

      if (!canQuery) {
        console.log('[ChatInterface] BLOCKED: canQuery is false');
        toast.error('You do not have permission to ask questions');
        return;
      }

      if (!activeWorkspace) {
        console.log('[ChatInterface] BLOCKED: no activeWorkspace');
        toast.error('Please select a workspace');
        return;
      }

      // If no conversation, create one first
      if (!conversation) {
        console.log('[ChatInterface] Creating new conversation...');
        setPendingQuestion(question);
        createConversationMutation.mutate(question);
        return;
      }

      console.log('[ChatInterface] Sending to existing conversation:', conversation.id);
      handleSendWithConversation(question, conversation.id);
    },
    [
      canQuery,
      activeWorkspace,
      conversation,
      handleSendWithConversation,
      createConversationMutation,
    ]
  );

  const handleFeedback = useCallback(
    (messageId: string, feedback: 'positive' | 'negative' | null) => {
      feedbackMutation.mutate({ messageId, feedback });
    },
    [feedbackMutation]
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      // Find the user message before this assistant message
      const messageIndex = localMessages.findIndex((m) => m.id === messageId);
      if (messageIndex <= 0) return;

      const userMessage = localMessages[messageIndex - 1];
      if (userMessage?.role !== 'user') return;

      // Remove the last assistant message
      setLocalMessages((prev) => prev.slice(0, -1));

      // Regenerate
      if (conversation?.id) {
        startStreaming(userMessage.content, conversation.id);
      }
    },
    [localMessages, conversation?.id, startStreaming]
  );

  const isLoading =
    createConversationMutation.isPending || (isStreaming && streamingContent.length === 0);

  return (
    <div className="flex h-full flex-col">
      {/* ISSUE #44 FIX: Error alert with retry button */}
      {streamingError && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>{streamingError}</span>
            {lastQuestionRef.current && (
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
        <EmptyState
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

// Empty state component
function EmptyState({
  workspaceName,
  canQuery,
  onExampleClick,
}: {
  workspaceName?: string;
  canQuery: boolean;
  onExampleClick: (question: string) => void;
}) {
  const exampleQuestions = [
    'How does authentication work?',
    'What are the main features?',
    'Summarize the documentation',
    'How do I get started?',
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {workspaceName ? `Welcome to ${workspaceName}` : 'Start a Conversation'}
        </h2>
        <p className="text-muted-foreground mb-6">
          Ask questions about your knowledge base and get AI-powered answers with source citations.
        </p>

        {!canQuery && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have read-only access. Contact the workspace owner for query
              permissions.
            </AlertDescription>
          </Alert>
        )}

        {canQuery && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {exampleQuestions.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  onClick={() => onExampleClick(question)}
                  className="text-xs"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
