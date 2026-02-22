'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Loader2,
  UserPlus,
  MoreHorizontal,
  Trash2,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { organizationsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';
import { destructiveActionClasses } from '@/lib/styles/status-colors';
import type { OrgMember, OrgRole } from '@/types';

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['org-admin', 'billing-admin', 'auditor', 'member']),
});

type InviteForm = z.infer<typeof inviteSchema>;

const roleBadgeColor: Record<OrgRole, string> = {
  'org-admin': 'bg-blue-100 text-blue-700',
  'billing-admin': 'bg-purple-100 text-purple-700',
  auditor: 'bg-amber-100 text-amber-700',
  member: 'bg-gray-100 text-gray-700',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrgMembersPage({ params }: PageProps) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);

  const { data: orgData } = useQuery({
    queryKey: ['organization', id],
    queryFn: async () => {
      const response = await organizationsApi.get(id);
      return response.data?.organization;
    },
    enabled: !!id,
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members', id],
    queryFn: async () => {
      const response = await organizationsApi.getMembers(id);
      return response.data?.members ?? [];
    },
    enabled: !!id,
  });

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const inviteMutation = useMutation({
    mutationFn: (data: InviteForm) => organizationsApi.invite(id, data.email, data.role),
    onSuccess: () => {
      toast.success('Invitation sent');
      setInviteDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['org-members', id] });
    },
    onError: () => {
      toast.error('Failed to send invitation');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRole }) =>
      organizationsApi.updateMember(id, memberId, role),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['org-members', id] });
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(id, memberId),
    onSuccess: () => {
      toast.success('Member removed');
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['org-members', id] });
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });

  const isOwner = orgData?.ownerId === currentUser?.id;
  const isAdmin = members?.find((m) => m.userId === currentUser?.id)?.role === 'org-admin';
  const canManage = isOwner || isAdmin;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/organization">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          All Organizations
        </Button>
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{orgData?.name ?? 'Organization'} — Members</h1>
          <p className="text-muted-foreground">Manage who has access to this organization</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/organization/${id}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
          {canManage && (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Organization Member</DialogTitle>
                  <DialogDescription>
                    The user must already have an account to be invited.
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
                            <Input placeholder="colleague@company.com" {...field} />
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="auditor">Auditor</SelectItem>
                              <SelectItem value="billing-admin">Billing Admin</SelectItem>
                              <SelectItem value="org-admin">Org Admin</SelectItem>
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
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members?.length ?? 0})</CardTitle>
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
            <p className="text-muted-foreground text-center py-8">No members yet</p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => {
                const isCurrentUser = member.userId === currentUser?.id;
                const isOrgOwner = member.userId === orgData?.ownerId;

                return (
                  <div key={member.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(member.user?.name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.user?.name}</p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                          {isOrgOwner && (
                            <Badge variant="outline" className="text-xs">
                              Owner
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className={roleBadgeColor[member.role]} variant="secondary">
                        {member.role}
                      </Badge>

                      {canManage && !isOrgOwner && !isCurrentUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${member.user?.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={member.role === 'member'}
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  memberId: member.id,
                                  role: 'member',
                                })
                              }
                            >
                              Make Member
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={member.role === 'auditor'}
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  memberId: member.id,
                                  role: 'auditor',
                                })
                              }
                            >
                              Make Auditor
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={member.role === 'billing-admin'}
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  memberId: member.id,
                                  role: 'billing-admin',
                                })
                              }
                            >
                              Make Billing Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={member.role === 'org-admin'}
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  memberId: member.id,
                                  role: 'org-admin',
                                })
                              }
                            >
                              Make Org Admin
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setMemberToRemove(member);
                                setRemoveDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke <strong>{memberToRemove?.user?.name}</strong>&apos;s access to this
              organization. They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={destructiveActionClasses}
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove.id)}
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
    </div>
  );
}
