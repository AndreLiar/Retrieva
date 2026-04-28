'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Pin,
  Calendar,
  MessageCircle,
  Plus,
  Loader2,
  Trash2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/onboarding/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { conversationsApi } from '@/lib/api';
import { useActiveWorkspace, useWorkspaceListQuery } from '@/lib/hooks';
import { destructiveActionClasses } from '@/lib/styles/status-colors';
import type { Conversation } from '@/types';

export function ConversationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const { data: workspaces = [], isLoading: workspacesLoading } = useWorkspaceListQuery();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['conversations', activeWorkspace?.id],
    queryFn: async () => {
      const response = await conversationsApi.list({ limit: 100 });
      return response.data?.conversations || [];
    },
    enabled: !!activeWorkspace?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation deleted');
      setConversationToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete conversation');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => conversationsApi.bulkDelete(ids),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(`${response.data?.deletedCount || 0} conversations deleted`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      setDeleteDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to delete conversations');
    },
  });

  const conversations: Conversation[] = data || [];
  const pinnedConversations = conversations.filter((conversation) => conversation.isPinned);
  const recentConversations = conversations.filter((conversation) => !conversation.isPinned);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(conversations.map((conversation) => conversation.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteClick = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteMutation.mutate(conversationToDelete);
    } else if (selectedIds.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
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
        <p className="text-muted-foreground">
          {workspaces.length === 0
            ? 'Create a workspace to get started'
            : 'Select a workspace to view conversations'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Conversations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage your chat history
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <Button
              variant={isSelectionMode ? 'secondary' : 'outline'}
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) {
                  setSelectedIds(new Set());
                }
              }}
            >
              {isSelectionMode ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Select
                </>
              )}
            </Button>
          )}
          <Button onClick={() => router.push('/chat')}>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>

      {isSelectionMode && selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
            <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={bulkDeleteMutation.isPending}
          >
            {bulkDeleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Selected
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">Failed to load conversations</p>
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          heading="No conversations yet"
          description="Ask AI questions about your vendor documents - every answer is grounded in the documents you have uploaded, with citations showing exactly where each finding came from."
          cta="Start a conversation"
          onAction={() => router.push('/chat')}
          hint={'Try: "What are the gaps in [vendor]\'s ISO 27001 policy?" or "Does the contract include Art. 30 audit rights?"'}
        />
      ) : (
        <div className="space-y-6">
          {pinnedConversations.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Pin className="h-4 w-4" />
                Pinned ({pinnedConversations.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pinnedConversations.map((conversation) => (
                  <Card
                    key={conversation.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/conversations/${conversation.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isSelectionMode && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSelection(conversation.id);
                                }}
                                className="shrink-0"
                              >
                                {selectedIds.has(conversation.id) ? (
                                  <CheckSquare className="h-4 w-4 text-primary" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            <h3 className="font-medium truncate">{conversation.title}</h3>
                            <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {conversation.messageCount} messages
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(conversation.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {!isSelectionMode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 shrink-0 ${destructiveActionClasses}`}
                            onClick={(event) => handleDeleteClick(conversation.id, event)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {recentConversations.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Recent ({recentConversations.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {recentConversations.map((conversation) => (
                  <Card
                    key={conversation.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/conversations/${conversation.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isSelectionMode && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSelection(conversation.id);
                                }}
                                className="shrink-0"
                              >
                                {selectedIds.has(conversation.id) ? (
                                  <CheckSquare className="h-4 w-4 text-primary" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            <h3 className="font-medium truncate">{conversation.title}</h3>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {conversation.messageCount} messages
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(conversation.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {!isSelectionMode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 shrink-0 ${destructiveActionClasses}`}
                            onClick={(event) => handleDeleteClick(conversation.id, event)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conversationToDelete ? 'Delete conversation?' : `Delete ${selectedIds.size} conversations?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {conversationToDelete
                ? 'This conversation will be permanently deleted. This action cannot be undone.'
                : `These ${selectedIds.size} conversations will be permanently deleted. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setConversationToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={destructiveActionClasses}
              disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
            >
              {(deleteMutation.isPending || bulkDeleteMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
