'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { conversationsApi } from '@/features/chat/api/conversations';
import { useActiveWorkspace } from '@/features/workspaces/queries/use-workspace-queries';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useStreaming } from '@/features/chat/hooks/use-streaming';
import type { Conversation, Message } from '@/types';

const EMPTY_MESSAGES: Message[] = [];

interface UseChatSessionOptions {
  conversation?: Conversation;
  messages?: Message[];
  onConversationCreated?: (conversation: Conversation) => void;
  onMessageAdded?: (message: Message) => void;
}

export function useChatSession({
  conversation,
  messages,
  onConversationCreated,
  onMessageAdded,
}: UseChatSessionOptions) {
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const { canQuery, canViewSources } = usePermissions();
  const canViewSourcesRef = useRef(canViewSources);
  const stableMessages = messages ?? EMPTY_MESSAGES;
  const [localMessages, setLocalMessages] = useState<Message[]>(stableMessages);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const lastQuestionRef = useRef<{
    question: string;
    conversationId: string;
    workspaceId: string | null;
  } | null>(null);
  const optimisticUserMessageIdRef = useRef<string | null>(null);
  const [hasLastQuestion, setHasLastQuestion] = useState(false);

  useEffect(() => {
    canViewSourcesRef.current = canViewSources;
  }, [canViewSources]);

  useEffect(() => {
    if (stableMessages.length > 0 || localMessages.length > 0) {
      // Keep the optimistic message buffer aligned with server-driven message resets.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalMessages(stableMessages);
    }
  }, [stableMessages, localMessages.length]);

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
      optimisticUserMessageIdRef.current = null;
      const assistantMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: conversation?.id || '',
        role: 'assistant',
        content,
        sources: canViewSourcesRef.current ? sources : undefined,
        createdAt: new Date().toISOString(),
        feedback: null,
      };
      setLocalMessages((prev) => [...prev, assistantMessage]);
      onMessageAdded?.(assistantMessage);

      if (conversation?.id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      }
    },
    onError: (error) => {
      if (optimisticUserMessageIdRef.current) {
        setLocalMessages((prev) =>
          prev.filter((message) => message.id !== optimisticUserMessageIdRef.current)
        );
        optimisticUserMessageIdRef.current = null;
      }
      toast.error(error);
    },
  });

  const handleSendWithConversation = useCallback(
    async (question: string, conversationId: string, workspaceId: string | null) => {
      lastQuestionRef.current = { question, conversationId, workspaceId };
      setHasLastQuestion(true);

      const messageId = `user-${Date.now()}`;
      const userMessage: Message = {
        id: messageId,
        conversationId,
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
        feedback: null,
      };

      optimisticUserMessageIdRef.current = messageId;
      setLocalMessages((prev) => [...prev, userMessage]);
      startStreaming(question, conversationId, workspaceId ?? undefined);
    },
    [startStreaming]
  );

  const createConversationMutation = useMutation({
    mutationFn: async (question: string) => {
      if (!activeWorkspace) {
        throw new Error('No workspace selected');
      }

      const response = await conversationsApi.create({
        workspaceId: activeWorkspace.id,
        title: question.slice(0, 50) + (question.length > 50 ? '...' : ''),
      });
      return response.data?.conversation;
    },
    onSuccess: (newConversation) => {
      if (!newConversation) return;

      onConversationCreated?.(newConversation);
      if (pendingQuestion) {
        handleSendWithConversation(pendingQuestion, newConversation.id, activeWorkspace?.id ?? null);
        setPendingQuestion(null);
      }
    },
    onError: () => {
      toast.error('Failed to create conversation');
      setPendingQuestion(null);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({
      messageId,
      feedback,
    }: {
      messageId: string;
      feedback: 'positive' | 'negative' | null;
    }) => {
      if (!conversation?.id) return;
      await conversationsApi.submitFeedback(conversation.id, messageId, { feedback });
    },
    onSuccess: (_, { messageId, feedback }) => {
      setLocalMessages((prev) =>
        prev.map((message) => (message.id === messageId ? { ...message, feedback } : message))
      );
    },
    onError: () => {
      toast.error('Failed to submit feedback');
    },
  });

  const handleSend = useCallback(
    async (question: string) => {
      if (!canQuery) {
        toast.error('You do not have permission to ask questions');
        return;
      }

      if (!activeWorkspace) {
        toast.error('Please select a workspace');
        return;
      }

      if (!conversation) {
        setPendingQuestion(question);
        createConversationMutation.mutate(question);
        return;
      }

      handleSendWithConversation(question, conversation.id, activeWorkspace.id);
    },
    [activeWorkspace, canQuery, conversation, createConversationMutation, handleSendWithConversation]
  );

  const handleRetry = useCallback(() => {
    if (!lastQuestionRef.current) {
      toast.error('No previous question to retry');
      return;
    }

    const { question, conversationId, workspaceId } = lastQuestionRef.current;
    setLocalMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.role === 'assistant' && !lastMessage.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    startStreaming(question, conversationId, workspaceId ?? undefined);
  }, [startStreaming]);

  const handleFeedback = useCallback(
    (messageId: string, feedback: 'positive' | 'negative' | null) => {
      feedbackMutation.mutate({ messageId, feedback });
    },
    [feedbackMutation]
  );

  function handleRegenerate(messageId: string) {
    const messageIndex = localMessages.findIndex((message) => message.id === messageId);
    if (messageIndex <= 0) return;

    const userMessage = localMessages[messageIndex - 1];
    if (userMessage?.role !== 'user') return;

    setLocalMessages((prev) => prev.slice(0, -1));
    if (conversation?.id) {
      startStreaming(userMessage.content, conversation.id, activeWorkspace?.id);
    }
  }

  return {
    activeWorkspace,
    canQuery,
    canViewSources,
    localMessages,
    streamingContent,
    streamingStatus,
    streamingSources,
    streamingError,
    isStreaming,
    isLoading:
      createConversationMutation.isPending || (isStreaming && streamingContent.length === 0),
    hasLastQuestion,
    handleSend,
    handleRetry,
    handleFeedback,
    handleRegenerate,
    stopStreaming,
  };
}
