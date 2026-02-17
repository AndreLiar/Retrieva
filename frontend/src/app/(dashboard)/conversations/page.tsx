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

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useActiveWorkspace, useWorkspaceStore } from '@/lib/stores/workspace-store';
import { destructiveActionClasses } from '@/lib/styles/status-colors';
import { toast } from 'sonner';
import type { Conversation } from '@/types';

export default function ConversationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const workspacesLoading = useWorkspaceStore((state) => state.isLoading);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  // Selection state
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

  // Single delete mutation
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

  // Bulk delete mutation
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
  const pinnedConversations = conversations.filter((c) => c.isPinned);
  const recentConversations = conversations.filter((c) => !c.isPinned);

  const handleNewConversation = () => {
    router.push('/chat');
  };

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
    setSelectedIds(new Set(conversations.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size > 0) {
      setDeleteDialogOpen(true);
    }
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteMutation.mutate(conversationToDelete);
    } else if (selectedIds.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  // Show loading while workspaces are still being fetched
  if (workspacesLoading || (workspaces.length === 0 && !activeWorkspace)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace to view conversations</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-muted-foreground">
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
          <Button onClick={handleNewConversation}>
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Selection Action Bar */}
      {isSelectionMode && selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-muted rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              Deselect All
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDeleteClick}
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
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
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
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">No conversations yet</h2>
          <p className="text-muted-foreground mb-4">
            Start a new chat to begin exploring your knowledge base
          </p>
          <Button onClick={handleNewConversation}>
            <Plus className="h-4 w-4 mr-2" />
            Start a Conversation
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned conversations */}
          {pinnedConversations.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Pin className="h-4 w-4" />
                Pinned ({pinnedConversations.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pinnedConversations.map((conversation) => (
                  <ConversationCard
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={selectedIds.has(conversation.id)}
                    isSelectionMode={isSelectionMode}
                    onToggleSelect={() => toggleSelection(conversation.id)}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleSelection(conversation.id);
                      } else {
                        router.push(`/conversations/${conversation.id}`);
                      }
                    }}
                    onDelete={(e) => handleDeleteClick(conversation.id, e)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent conversations */}
          {recentConversations.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Recent ({recentConversations.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {recentConversations.map((conversation) => (
                  <ConversationCard
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={selectedIds.has(conversation.id)}
                    isSelectionMode={isSelectionMode}
                    onToggleSelect={() => toggleSelection(conversation.id)}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleSelection(conversation.id);
                      } else {
                        router.push(`/conversations/${conversation.id}`);
                      }
                    }}
                    onDelete={(e) => handleDeleteClick(conversation.id, e)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation{selectedIds.size > 1 || (!conversationToDelete && selectedIds.size > 0) ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {conversationToDelete ? (
                'Are you sure you want to delete this conversation? This action cannot be undone.'
              ) : (
                `Are you sure you want to delete ${selectedIds.size} conversation${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setConversationToDelete(null);
              setDeleteDialogOpen(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={destructiveActionClasses}
            >
              {(deleteMutation.isPending || bulkDeleteMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConversationCard({
  conversation,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  onClick,
  onDelete,
}: {
  conversation: Conversation;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const formattedDate = new Date(conversation.lastMessageAt || conversation.createdAt).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric', year: 'numeric' }
  );

  return (
    <Card
      className={`group cursor-pointer transition-colors ${
        isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Selection checkbox or icon */}
          {isSelectionMode ? (
            <div
              className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
            >
              {isSelected ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{conversation.title}</h3>
              {conversation.isPinned && (
                <Pin className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {conversation.messageCount}
              </span>
            </div>
          </div>
          {/* Delete button - only show when not in selection mode */}
          {/* A11Y FIX: Added focus:opacity-100 for keyboard navigation and aria-label */}
          {!isSelectionMode && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete conversation: ${conversation.title}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
