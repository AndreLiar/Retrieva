'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Pin,
  MoreHorizontal,
  Trash2,
  PinOff,
  Plus,
  Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { destructiveActionClasses } from '@/lib/styles/status-colors';
import type { Conversation } from '@/types';

interface ConversationListProps {
  onNewConversation?: () => void;
  selectedId?: string;
}

export function ConversationList({
  onNewConversation,
  selectedId,
}: ConversationListProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  // Fetch conversations
  const { data, isLoading, error } = useQuery({
    queryKey: ['conversations', activeWorkspace?.id],
    queryFn: async () => {
      const response = await conversationsApi.list({ limit: 50 });
      // Handle both array response and paginated response formats
      const responseData = response.data;
      if (Array.isArray(responseData)) {
        return responseData;
      }
      return responseData?.conversations || [];
    },
    enabled: !!activeWorkspace?.id,
  });

  const conversations: Conversation[] = data || [];

  // Pin/unpin mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({
      id,
      isPinned,
    }: {
      id: string;
      isPinned: boolean;
    }) => {
      await conversationsApi.togglePin(id, isPinned);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('Failed to update conversation');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await conversationsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation deleted');
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete conversation');
    },
  });

  // Filter conversations
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Separate pinned and unpinned
  const pinnedConversations = filteredConversations.filter((c) => c.isPinned);
  const unpinnedConversations = filteredConversations.filter((c) => !c.isPinned);

  const handleDelete = (id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteMutation.mutate(conversationToDelete);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a workspace to view conversations
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-3">
        <Button
          onClick={onNewConversation}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load conversations
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {search ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          <div className="p-2">
            {/* Pinned section */}
            {pinnedConversations.length > 0 && (
              <div className="mb-4">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Pinned
                </p>
                {pinnedConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={
                      selectedId === conversation.id ||
                      pathname === `/conversations/${conversation.id}`
                    }
                    onTogglePin={() =>
                      togglePinMutation.mutate({
                        id: conversation.id,
                        isPinned: false,
                      })
                    }
                    onDelete={() => handleDelete(conversation.id)}
                  />
                ))}
              </div>
            )}

            {/* Recent section */}
            {unpinnedConversations.length > 0 && (
              <div>
                {pinnedConversations.length > 0 && (
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                    Recent
                  </p>
                )}
                {unpinnedConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={
                      selectedId === conversation.id ||
                      pathname === `/conversations/${conversation.id}`
                    }
                    onTogglePin={() =>
                      togglePinMutation.mutate({
                        id: conversation.id,
                        isPinned: true,
                      })
                    }
                    onDelete={() => handleDelete(conversation.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={destructiveActionClasses}
            >
              {deleteMutation.isPending ? (
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

// Individual conversation item
interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}

function ConversationItem({
  conversation,
  isSelected,
  onTogglePin,
  onDelete,
}: ConversationItemProps) {
  const formattedDate = new Date(conversation.lastMessageAt).toLocaleDateString(
    undefined,
    { month: 'short', day: 'numeric' }
  );

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-lg p-2 hover:bg-muted/50 transition-colors',
        isSelected && 'bg-muted'
      )}
    >
      <Link
        href={`/conversations/${conversation.id}`}
        className="flex-1 min-w-0 flex items-center gap-2"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{conversation.title}</p>
          <p className="text-xs text-muted-foreground">
            {formattedDate} · {conversation.messageCount} messages
          </p>
        </div>
        {conversation.isPinned && (
          <Pin className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </Link>

      {/* Actions dropdown */}
      {/* A11Y FIX: Added focus:opacity-100 for keyboard navigation and aria-label */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
            aria-label={`Actions for conversation: ${conversation.title}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onTogglePin}>
            {conversation.isPinned ? (
              <>
                <PinOff className="h-4 w-4 mr-2" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="h-4 w-4 mr-2" />
                Pin
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
