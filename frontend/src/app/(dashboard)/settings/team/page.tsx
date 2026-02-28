'use client';

/**
 * /settings/team — Organisation team management
 *
 * Org admins can:
 *  - See all active and pending members
 *  - Invite new members by email with a role
 *  - Remove members (except themselves)
 *
 * Analysts and viewers see the member list read-only.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Users,
  UserPlus,
  Loader2,
  Mail,
  Trash2,
  Clock,
  Crown,
  Eye,
  BarChart2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/lib/stores/auth-store';
import { organizationsApi, type OrgMember } from '@/lib/api/organizations';

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  org_admin: {
    label: 'Admin',
    description: 'Full access — manage team, create vendors, run assessments',
    icon: Crown,
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
  },
  analyst: {
    label: 'Compliance Analyst',
    description: 'Create and run assessments, send questionnaires, view all vendors',
    icon: BarChart2,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  },
  viewer: {
    label: 'Read-only',
    description: 'View assessments and results only — no create or edit access',
    icon: Eye,
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
} as const;

type RoleKey = keyof typeof ROLE_CONFIG;

function RoleBadge({ role }: { role: RoleKey }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>
      {cfg.label}
    </Badge>
  );
}

function memberInitials(member: OrgMember): string {
  const name = member.user?.name;
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return member.email.slice(0, 2).toUpperCase();
}

// ── Invite form schema ────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['org_admin', 'analyst', 'viewer']),
});
type InviteFormData = z.infer<typeof inviteSchema>;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Fetch org + members
  const { data: orgData, isLoading: orgLoading } = useQuery({
    queryKey: ['org-me'],
    queryFn: () => organizationsApi.getMe(),
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => organizationsApi.getMembers(),
    enabled: !!orgData?.data?.organization,
  });

  const isLoading = orgLoading || membersLoading;
  const org = orgData?.data?.organization ?? null;
  const myRole = orgData?.data?.role as RoleKey | null;
  const members: OrgMember[] = membersData?.data?.members ?? [];
  const isAdmin = myRole === 'org_admin';

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'pending');

  // Invite mutation
  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'analyst' },
  });

  const inviteMutation = useMutation({
    mutationFn: (data: InviteFormData) => organizationsApi.invite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success('Invitation sent');
      form.reset();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to send invitation';
      toast.error(msg);
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success('Member removed');
      setRemovingId(null);
    },
    onError: () => toast.error('Failed to remove member'),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading team…
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground text-sm">
          You are not part of an organisation yet. Create one from the onboarding page or ask your admin to invite you.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Team Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {org.name} · {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
          {pendingMembers.length > 0 && ` · ${pendingMembers.length} pending`}
        </p>
      </div>

      {/* Role legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Access Roles
          </CardTitle>
          <CardDescription>What each role can do on the platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.entries(ROLE_CONFIG) as [RoleKey, typeof ROLE_CONFIG[RoleKey]][]).map(
            ([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">{cfg.description}</p>
                  </div>
                </div>
              );
            }
          )}
        </CardContent>
      </Card>

      {/* Active members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Active Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {activeMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active members yet.</p>
          ) : (
            activeMembers.map((member, idx) => {
              const isSelf = user?.email === member.email;
              return (
                <div key={member.id}>
                  {idx > 0 && <Separator className="my-2" />}
                  <div className="flex items-center gap-3 py-1">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{memberInitials(member)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.user?.name ?? member.email}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      {member.user?.name && (
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      )}
                    </div>
                    <RoleBadge role={member.role as RoleKey} />
                    {member.joinedAt && (
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        Joined {format(new Date(member.joinedAt), 'dd MMM yyyy')}
                      </span>
                    )}
                    {isAdmin && !isSelf && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setRemovingId(member.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {member.user?.name ?? member.email} will lose access to{' '}
                              <strong>{org.name}</strong> and all vendor workspaces. This cannot be
                              undone — you would need to re-invite them.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setRemovingId(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removeMutation.mutate(member.id)}
                              disabled={removeMutation.isPending && removingId === member.id}
                            >
                              {removeMutation.isPending && removingId === member.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : null}
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Pending invites */}
      {pendingMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              These users have been invited but have not yet accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            {pendingMembers.map((member, idx) => (
              <div key={member.id}>
                {idx > 0 && <Separator className="my-2" />}
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-muted">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <RoleBadge role={member.role as RoleKey} />
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">
                    Pending
                  </Badge>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setRemovingId(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The invitation link sent to <strong>{member.email}</strong> will be
                            revoked. They will not be able to join.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setRemovingId(null)}>
                            Keep
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => removeMutation.mutate(member.id)}
                            disabled={removeMutation.isPending && removingId === member.id}
                          >
                            Cancel invitation
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Invite new member — admins only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Team Member
            </CardTitle>
            <CardDescription>
              They will receive an email with a secure link to join {org.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => inviteMutation.mutate(data))}
                className="flex flex-col sm:flex-row gap-3"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="sr-only">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="colleague@company.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem className="w-full sm:w-48">
                      <FormLabel className="sr-only">Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="org_admin">Admin</SelectItem>
                          <SelectItem value="analyst">Compliance Analyst</SelectItem>
                          <SelectItem value="viewer">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={inviteMutation.isPending} className="shrink-0">
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send invite
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
