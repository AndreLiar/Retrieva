'use client';

import { useRouter } from 'next/navigation';
import { Loader2, MessageSquarePlus } from 'lucide-react';

import { ChatInterface } from '@/components/chat';
import { useActiveWorkspace, useWorkspaceStore } from '@/lib/stores/workspace-store';
import type { Conversation } from '@/types';

// /chat — blank new conversation page.
// ChatInterface creates the conversation on first send, then onConversationCreated
// redirects the user to /conversations/<id> so the URL reflects the saved session.
export default function NewChatPage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const workspacesLoading = useWorkspaceStore((state) => state.isLoading);

  const handleConversationCreated = (conversation: Conversation) => {
    router.replace(`/conversations/${conversation.id}`);
  };

  if (workspacesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace to start a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-4 py-2">
        <MessageSquarePlus className="h-4 w-4 mr-2 text-muted-foreground" />
        <h1 className="text-sm font-medium">New Conversation</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface onConversationCreated={handleConversationCreated} />
      </div>
    </div>
  );
}
