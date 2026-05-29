'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
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
    labelKey: 'settings.team.roles.adminLabel',
    descKey: 'settings.team.roles.adminDesc',
    icon: Crown,
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
  },
  analyst: {
    labelKey: 'settings.team.roles.analystLabel',
    descKey: 'settings.team.roles.analystDesc',
    icon: BarChart2,
    badgeClass: 'bg-info-muted text-info border-info-muted',
  },
  viewer: {
    labelKey: 'settings.team.roles.viewerLabel',
    descKey: 'settings.team.roles.viewerDesc',
    icon: Eye,
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
} as const;

type RoleKey = keyof typeof ROLE_CONFIG;

function RoleBadge({ role }: { role: RoleKey }) {
  const { t } = useTranslation();
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>
      {t(cfg.labelKey)}
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

export function TeamSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
  const isAdmin = myRole === 'org_admin';

  const { activeMembers, pendingMembers } = useMemo(() => {
    const members: OrgMember[] = membersData?.data?.members ?? [];
    return {
      activeMembers: members.filter((m) => m.status === 'active'),
      pendingMembers: members.filter((m) => m.status === 'pending'),
    };
  }, [membersData]);

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'analyst' },
  });

  const inviteMutation = useMutation({
    mutationFn: (data: InviteFormData) => organizationsApi.invite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success(t('settings.team.toastInviteSent'));
      form.reset();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('settings.team.toastInviteFailed');
      toast.error(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success(t('settings.team.toastMemberRemoved'));
      setRemovingId(null);
    },
    onError: () => toast.error(t('settings.team.toastRemoveFailed')),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('settings.team.loading')}
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground text-sm">
          {t('settings.team.noOrg')}
        </p>
      </div>
    );
  }

  return (
    <div className="page-container max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="page-title">{t('settings.team.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {org.name} · {t('settings.team.subActiveMembers', { count: activeMembers.length })}
          {pendingMembers.length > 0 && ` · ${t('settings.team.subPending', { count: pendingMembers.length })}`}
        </p>
      </div>

      {/* Role legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('settings.team.roles.title')}
          </CardTitle>
          <CardDescription>{t('settings.team.roles.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.entries(ROLE_CONFIG) as [RoleKey, typeof ROLE_CONFIG[RoleKey]][]).map(
            ([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t(cfg.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(cfg.descKey)}</p>
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
          <CardTitle className="text-sm font-medium">{t('settings.team.activeMembers')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {activeMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.team.noActiveMembers')}</p>
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
                          <span className="ml-1.5 text-xs text-muted-foreground">{t('settings.team.you')}</span>
                        )}
                      </p>
                      {member.user?.name && (
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      )}
                    </div>
                    <RoleBadge role={member.role as RoleKey} />
                    {member.joinedAt && (
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        {t('settings.team.joined', { date: format(new Date(member.joinedAt), 'dd MMM yyyy') })}
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
                            <AlertDialogTitle>{t('settings.team.removeTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('settings.team.removeDesc1', { name: member.user?.name ?? member.email })}
                              <strong>{org.name}</strong>
                              {t('settings.team.removeDesc2')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setRemovingId(null)}>
                              {t('common.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removeMutation.mutate(member.id)}
                              disabled={removeMutation.isPending && removingId === member.id}
                            >
                              {removeMutation.isPending && removingId === member.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : null}
                              {t('settings.team.remove')}
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
              {t('settings.team.pendingInvites')}
            </CardTitle>
            <CardDescription>
              {t('settings.team.pendingDesc')}
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
                    {t('settings.team.pendingBadge')}
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
                          <AlertDialogTitle>{t('settings.team.cancelInviteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('settings.team.cancelInviteDesc1')}<strong>{member.email}</strong>{t('settings.team.cancelInviteDesc2')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setRemovingId(null)}>
                            {t('settings.team.keep')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => removeMutation.mutate(member.id)}
                            disabled={removeMutation.isPending && removingId === member.id}
                          >
                            {t('settings.team.cancelInvite')}
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
              {t('settings.team.inviteTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.team.inviteDesc', { org: org.name })}
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
                      <FormLabel className="sr-only">{t('settings.profile.email')}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t('settings.team.emailPlaceholder')}
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
                      <FormLabel className="sr-only">{t('settings.team.roleLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('settings.team.rolePlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="org_admin">{t('settings.team.roles.adminLabel')}</SelectItem>
                          <SelectItem value="analyst">{t('settings.team.roles.analystLabel')}</SelectItem>
                          <SelectItem value="viewer">{t('settings.team.roles.viewerLabel')}</SelectItem>
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
                  {t('settings.team.sendInvite')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
