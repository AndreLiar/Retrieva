'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatInterface } from '@/components/chat';
import { useActiveWorkspace, useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Conversation } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [hasFetched, setHasFetched] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

  // Fetch workspaces on mount if authenticated and not already loaded
  useEffect(() => {
    if (isAuthenticated && workspaces.length === 0 && !isLoading && !hasFetched) {
      console.log('[Chat Page] Fetching workspaces...');
      setHasFetched(true);
      fetchWorkspaces();
    }
  }, [isAuthenticated, workspaces.length, isLoading, hasFetched, fetchWorkspaces]);

  // Debug logging
  useEffect(() => {
    console.log('[Chat Page] State:', {
      workspacesCount: workspaces.length,
      activeWorkspaceId,
      activeWorkspace: activeWorkspace ? {
        id: activeWorkspace.id,
        name: activeWorkspace.name,
        role: activeWorkspace.membership?.role,
      } : null,
      isLoading,
      isAuthenticated,
      currentConversation: currentConversation?.id,
    });
  }, [workspaces, activeWorkspaceId, activeWorkspace, isLoading, isAuthenticated, currentConversation]);

  // Auto-select first workspace if none selected but workspaces exist
  useEffect(() => {
    if (workspaces.length > 0 && !isLoading) {
      // Check if activeWorkspaceId is valid (exists in workspaces)
      const isValidActiveWorkspace = activeWorkspaceId &&
        workspaces.some(w => w.id === activeWorkspaceId);

      if (!isValidActiveWorkspace) {
        console.log('[Chat Page] Auto-selecting first workspace:', workspaces[0].id);
        setActiveWorkspace(workspaces[0].id);
      }
    }
  }, [activeWorkspaceId, workspaces, isLoading, setActiveWorkspace]);

  const handleConversationCreated = (conversation: Conversation) => {
    // Store the conversation locally instead of navigating away
    // This prevents cancelling the streaming fetch
    console.log('[Chat Page] Conversation created:', conversation.id);
    setCurrentConversation(conversation);
    // Update URL without navigation (optional - allows bookmarking)
    window.history.replaceState(null, '', `/conversations/${conversation.id}`);
  };

  // Show loading while fetching workspaces
  if (isLoading || (isAuthenticated && workspaces.length === 0 && !hasFetched)) {
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
                ? 'You need to connect a workspace first. Go to Notion to connect your Notion workspace.'
                : 'Please select a workspace to start asking questions.'}
            </AlertDescription>
          </Alert>
          {workspaces.length === 0 ? (
            <Link href="/notion">
              <Button>Connect Notion Workspace</Button>
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
