'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { useActiveWorkspace } from '@/lib/hooks';
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
  const { t } = useTranslation();
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
      toast.error(t('chat.ui.sidebar.updateFailed'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await conversationsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(t('chat.list.toast.deleted'));
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    },
    onError: () => {
      toast.error(t('chat.list.toast.deleteFailed'));
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
        {t('chat.selectWorkspaceConv')}
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
          {t('chat.list.newChat')}
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('chat.ui.sidebar.search')}
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
            {t('chat.list.failedLoad')}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {search ? t('chat.ui.sidebar.noneFound') : t('chat.ui.sidebar.noneYet')}
          </div>
        ) : (
          <div className="p-2">
            {/* Pinned section */}
            {pinnedConversations.length > 0 && (
              <div className="mb-4">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  {t('chat.ui.sidebar.pinned')}
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
                    {t('chat.ui.sidebar.recent')}
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
            <AlertDialogTitle>{t('chat.list.deleteOne')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.ui.sidebar.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={destructiveActionClasses}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.delete')
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
  const { t } = useTranslation();
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
            {formattedDate} · {t('chat.messageCount', { count: conversation.messageCount })}
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
            aria-label={t('chat.ui.sidebar.actionsAria', { title: conversation.title })}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onTogglePin}>
            {conversation.isPinned ? (
              <>
                <PinOff className="h-4 w-4 mr-2" />
                {t('chat.ui.sidebar.unpin')}
              </>
            ) : (
              <>
                <Pin className="h-4 w-4 mr-2" />
                {t('chat.ui.sidebar.pin')}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
