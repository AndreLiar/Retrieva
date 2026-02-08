'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { workspacesApi } from '@/lib/api';
import { inviteMemberSchema, type InviteMemberFormData } from '@/lib/utils/validation';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/utils/permissions';
import type { WorkspaceMembership, WorkspaceRole } from '@/types';

interface MembersPageProps {
  params: Promise<{ id: string }>;
}

export default function MembersPage({ params }: MembersPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const currentUser = useAuthStore((state) => state.user);
  const { isWorkspaceOwner } = usePermissions();

  const workspace = workspaces.find((w) => w.id === id);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  // ISSUE #54 FIX: State for role change confirmation dialog
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
      toast.error('You do not have permission to manage members');
    }
  }, [workspace, isWorkspaceOwner, router, id]);

  // Fetch members
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

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: InviteMemberFormData) => {
      await workspacesApi.members.invite(id, data);
    },
    onSuccess: () => {
      toast.success('Invitation sent');
      setInviteDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error('Failed to send invitation');
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await workspacesApi.members.remove(id, memberId);
    },
    onSuccess: () => {
      toast.success('Member removed');
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });

  // Update role mutation
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
      toast.success('Role updated');
      // ISSUE #54 FIX: Close dialog and clear state on success
      setRoleChangeDialogOpen(false);
      setPendingRoleChange(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', id] });
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });

  // ISSUE #54 FIX: Helper to check if role change is a downgrade
  const isRoleDowngrade = (currentRole: WorkspaceRole, newRole: WorkspaceRole): boolean => {
    const roleOrder: Record<WorkspaceRole, number> = { owner: 3, member: 2, viewer: 1 };
    return roleOrder[newRole] < roleOrder[currentRole];
  };

  // ISSUE #54 FIX: Handle role change with confirmation for downgrades
  const handleRoleChange = (
    memberId: string,
    memberName: string,
    currentRole: WorkspaceRole,
    newRole: WorkspaceRole
  ) => {
    if (isRoleDowngrade(currentRole, newRole)) {
      // Show confirmation dialog for downgrades
      setPendingRoleChange({ memberId, memberName, currentRole, newRole });
      setRoleChangeDialogOpen(true);
    } else {
      // Direct update for upgrades
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
          Back to Workspace
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Team Members</h1>
          <p className="text-muted-foreground">
            Manage who has access to {workspace.name}
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join this workspace
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="colleague@example.com" {...field} />
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
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="member">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Member - Can query and view sources
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              Viewer - Read-only access
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
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Send Invite
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
          <CardTitle>Members ({members?.length || 0})</CardTitle>
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
              No members yet
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
                              You
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

                      {/* ISSUE #50 FIX: Show loading indicator during role update */}
                      {/* A11Y FIX: Added aria-label for screen readers */}
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
                                aria-label={`Actions for ${member.user.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* ISSUE #54 FIX: Use handleRoleChange for confirmation on downgrades */}
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
                                Make Member
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
                                Make Viewer
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
                                Remove
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
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke their access to this workspace. They can be
              re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ISSUE #54 FIX: Role downgrade confirmation dialog */}
      <AlertDialog open={roleChangeDialogOpen} onOpenChange={setRoleChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reduce Member Permissions?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRoleChange && (
                <>
                  You are about to change <strong>{pendingRoleChange.memberName}</strong>&apos;s
                  role from <strong>{getRoleDisplayName(pendingRoleChange.currentRole)}</strong> to{' '}
                  <strong>{getRoleDisplayName(pendingRoleChange.newRole)}</strong>.
                  <br /><br />
                  This will reduce their permissions in this workspace.
                  {pendingRoleChange.newRole === 'viewer' && (
                    <> They will no longer be able to query the knowledge base.</>
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
              Cancel
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
                'Confirm Change'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
