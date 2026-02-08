'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { ChatInterface } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { conversationsApi } from '@/lib/api';
import { useActiveWorkspace, useWorkspaceStore } from '@/lib/stores/workspace-store';
import type { Conversation, Message } from '@/types';

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export default function ConversationPage({ params }: ConversationPageProps) {
  const { id } = use(params);
  const activeWorkspace = useActiveWorkspace();
  const workspacesLoading = useWorkspaceStore((state) => state.isLoading);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  // Fetch conversation by ID - don't gate on workspace since the backend
  // already verifies ownership via userId, not workspaceId
  const { data, isLoading, error } = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const response = await conversationsApi.get(id);
      const conv = response.data?.conversation;
      const rawMessages = response.data?.messages || [];

      const conversation: Conversation = {
        id: String(conv?.id || id),
        title: conv?.title || 'Untitled',
        workspaceId: conv?.workspaceId || '',
        userId: conv?.userId || '',
        isPinned: false,
        messageCount: conv?.messageCount || 0,
        lastMessageAt: conv?.lastMessageAt || new Date().toISOString(),
        createdAt: conv?.createdAt || new Date().toISOString(),
        updatedAt: conv?.updatedAt || new Date().toISOString(),
      };

      // Map backend messages (timestamp) to frontend Message type (createdAt)
      const messages: Message[] = rawMessages.map((m) => ({
        id: String(m.id),
        conversationId: String(conv?.id || id),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.sources || undefined,
        createdAt: m.createdAt || m.timestamp || new Date().toISOString(),
        feedback: null,
      }));

      return { conversation, messages };
    },
    enabled: !!id,
  });

  // Show loading while workspaces are loading or conversation is being fetched
  if (workspacesLoading || (workspaces.length === 0 && !activeWorkspace) || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load conversation</p>
        <Link href="/conversations">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Conversations
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with back button and title */}
      {/* A11Y FIX: Added aria-label for back button */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/conversations" aria-label="Back to conversations list">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to conversations">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">{data.conversation.title}</h1>
          <p className="text-xs text-muted-foreground">
            {data.conversation.messageCount} messages
          </p>
        </div>
      </div>

      {/* Chat interface */}
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          conversation={data.conversation}
          messages={data.messages}
        />
      </div>
    </div>
  );
}
