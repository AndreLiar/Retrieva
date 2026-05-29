'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Loader2,
  UserPlus,
  MoreHorizontal,
  Trash2,
  Shield,
  User,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/stores/auth-store';
import { workspacesApi } from '@/lib/api';
import { inviteMemberSchema, type InviteMemberFormData } from '@/lib/utils/validation';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useWorkspaceQuery } from '@/lib/hooks';
import { destructiveActionClasses } from '@/lib/styles/status-colors';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/utils/permissions';
import type { WorkspaceRole } from '@/types';

interface WorkspaceMembersPageProps {
  id: string;
}

export function WorkspaceMembersPage({ id }: WorkspaceMembersPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const { isWorkspaceOwner } = usePermissions();
  const { data: workspace } = useWorkspaceQuery(id);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  const [roleChangeDialogOpen, setRoleChangeDialogOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    memberId: string;
    memberName: string;
    currentRole: WorkspaceRole;
    newRole: WorkspaceRole;
  } | null>(null);

  // Redirect if not owner
  useEffect(() => {
    if (workspace && !isWorkspaceOwner) {
      router.replace(`/workspaces/${id}`);
      toast.error(t('workspaces.members.permDenied'));
    }
  }, [workspace, isWorkspaceOwner, router, id, t]);

  const { data: members, isLoading } = useQuery({
    queryKey: ['workspace-members', id],
    queryFn: async () => {
      const response = await workspacesApi.members.list(id);
      return response.data?.members || [];
    },
    enabled: !!id && isWorkspaceOwner,
  });

  const form = useForm<InviteMemberFormData>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteMemberFormData) => {
      await workspacesApi.members.invite(id, data);
    },
    onSuccess: () => {
      toast.success(t('workspaces.members.toastInviteSent'));
      setInviteDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error(t('workspaces.members.toastInviteFailed'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await workspacesApi.members.remove(id, memberId);
    },
    onSuccess: () => {
      toast.success(t('workspaces.members.toastMemberRemoved'));
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error(t('workspaces.members.toastRemoveFailed'));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: WorkspaceRole;
    }) => {
      await workspacesApi.members.update(id, memberId, { role });
    },
    onSuccess: () => {
      toast.success(t('workspaces.members.toastRoleUpdated'));
      setRoleChangeDialogOpen(false);
      setPendingRoleChange(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error(t('workspaces.members.toastRoleFailed'));
    },
  });

  const isRoleDowngrade = (currentRole: WorkspaceRole, newRole: WorkspaceRole): boolean => {
    const roleOrder: Record<WorkspaceRole, number> = { owner: 3, member: 2, viewer: 1 };
    return roleOrder[newRole] < roleOrder[currentRole];
  };

  const handleRoleChange = (
    memberId: string,
    memberName: string,
    currentRole: WorkspaceRole,
    newRole: WorkspaceRole
  ) => {
    if (isRoleDowngrade(currentRole, newRole)) {
      setPendingRoleChange({ memberId, memberName, currentRole, newRole });
      setRoleChangeDialogOpen(true);
    } else {
      updateRoleMutation.mutate({ memberId, role: newRole });
    }
  };

  if (!workspace || !isWorkspaceOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getRoleIcon = (role: WorkspaceRole) => {
    switch (role) {
      case 'owner':
        return Shield;
      case 'member':
        return User;
      case 'viewer':
        return Eye;
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href={`/workspaces/${id}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('workspaces.members.back')}
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{t('workspaces.members.title')}</h1>
          <p className="text-muted-foreground">
            {t('workspaces.members.subtitle', { name: workspace.name })}
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('workspaces.members.inviteMember')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('workspaces.members.inviteTitle')}</DialogTitle>
              <DialogDescription>
                {t('workspaces.members.inviteDesc')}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => inviteMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('workspaces.members.email')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('workspaces.members.emailPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('workspaces.members.role')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('workspaces.members.selectRole')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="member">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {t('workspaces.members.memberOption')}
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              {t('workspaces.members.viewerOption')}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInviteDialogOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t('workspaces.members.sendInvite')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workspaces.members.membersCount', { count: members?.length || 0 })}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : !members || members.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t('workspaces.members.noMembers')}
            </p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => {
                const RoleIcon = getRoleIcon(member.role);
                const isCurrentUser = member.userId === currentUser?.id;
                const isOwner = member.role === 'owner';

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {member.user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.user.name}</p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">
                              {t('workspaces.members.you')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {member.user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={getRoleBadgeColor(member.role)}
                      >
                        <RoleIcon className="h-3 w-3 mr-1" />
                        {getRoleDisplayName(member.role)}
                      </Badge>

                      {!isOwner && !isCurrentUser && (
                        updateRoleMutation.isPending &&
                        updateRoleMutation.variables?.memberId === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={t('workspaces.members.actionsAria', { name: member.user.name })}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.id,
                                    member.user.name,
                                    member.role,
                                    'member'
                                  )
                                }
                                disabled={member.role === 'member'}
                              >
                                <User className="h-4 w-4 mr-2" />
                                {t('workspaces.members.makeMember')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.id,
                                    member.user.name,
                                    member.role,
                                    'viewer'
                                  )
                                }
                                disabled={member.role === 'viewer'}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                {t('workspaces.members.makeViewer')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setMemberToRemove(member.id);
                                  setRemoveDialogOpen(true);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('workspaces.members.remove')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove confirmation dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspaces.members.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workspaces.members.removeDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove)}
              className={destructiveActionClasses}
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('workspaces.members.remove')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role downgrade confirmation dialog */}
      <AlertDialog open={roleChangeDialogOpen} onOpenChange={setRoleChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspaces.members.reduceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRoleChange && (
                <>
                  {t('workspaces.members.reduceP1')}<strong>{pendingRoleChange.memberName}</strong>
                  {t('workspaces.members.reduceP2')}<strong>{getRoleDisplayName(pendingRoleChange.currentRole)}</strong>
                  {t('workspaces.members.reduceP3')}<strong>{getRoleDisplayName(pendingRoleChange.newRole)}</strong>
                  {t('workspaces.members.reduceP4')}
                  <br /><br />
                  {t('workspaces.members.reduceBody')}
                  {pendingRoleChange.newRole === 'viewer' && (
                    <>{t('workspaces.members.reduceViewer')}</>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingRoleChange(null);
              }}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRoleChange) {
                  updateRoleMutation.mutate({
                    memberId: pendingRoleChange.memberId,
                    role: pendingRoleChange.newRole,
                  });
                }
              }}
            >
              {updateRoleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('workspaces.members.confirmChange')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
