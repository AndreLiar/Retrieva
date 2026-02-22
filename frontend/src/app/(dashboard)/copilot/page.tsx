'use client';

import { useEffect, useState } from 'react';
import { ChatInterface } from '@/components/chat';
import { useActiveWorkspace, useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Conversation } from '@/types';

export default function CopilotPage() {
  const activeWorkspace = useActiveWorkspace();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    if (isAuthenticated && workspaces.length === 0 && !isLoading) {
      fetchWorkspaces();
    }
  }, [isAuthenticated, workspaces.length, isLoading, fetchWorkspaces]);

  useEffect(() => {
    if (workspaces.length > 0 && !isLoading) {
      const isValidActiveWorkspace =
        activeWorkspaceId && workspaces.some((w) => w.id === activeWorkspaceId);
      if (!isValidActiveWorkspace) {
        setActiveWorkspace(workspaces[0].id);
      }
    }
  }, [activeWorkspaceId, workspaces, isLoading, setActiveWorkspace]);

  const handleConversationCreated = (conversation: Conversation) => {
    setCurrentConversation(conversation);
    window.history.replaceState(null, '', `/conversations/${conversation.id}`);
  };

  if (isLoading || (isAuthenticated && workspaces.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {workspaces.length === 0
                ? 'No data sources connected yet. Connect a source to start asking DORA compliance questions.'
                : 'Please select a workspace to start using the Copilot.'}
            </AlertDescription>
          </Alert>
          {workspaces.length === 0 ? (
            <Link href="/sources">
              <Button>Connect a Data Source</Button>
            </Link>
          ) : (
            <Link href="/workspaces">
              <Button>Select a Workspace</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <ChatInterface
      conversation={currentConversation ?? undefined}
      onConversationCreated={handleConversationCreated}
    />
  );
}
