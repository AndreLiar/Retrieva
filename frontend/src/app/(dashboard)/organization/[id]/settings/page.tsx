'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { organizationsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';
import { destructiveActionClasses } from '@/lib/styles/status-colors';

const settingsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  maxWorkspaces: z.coerce.number().int().min(1).max(100),
  maxMembers: z.coerce.number().int().min(1).max(500),
  allowMembersToCreateWorkspaces: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrgSettingsPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: async () => {
      const response = await organizationsApi.get(id);
      return response.data?.organization;
    },
    enabled: !!id,
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    values: org
      ? {
          name: org.name,
          description: org.description ?? '',
          logoUrl: org.logoUrl ?? '',
          maxWorkspaces: org.settings.maxWorkspaces,
          maxMembers: org.settings.maxMembers,
          allowMembersToCreateWorkspaces: org.settings.allowMembersToCreateWorkspaces,
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (data: SettingsForm) =>
      organizationsApi.update(id, {
        name: data.name,
        description: data.description || undefined,
        logoUrl: data.logoUrl || undefined,
        settings: {
          maxWorkspaces: data.maxWorkspaces,
          maxMembers: data.maxMembers,
          allowMembersToCreateWorkspaces: data.allowMembersToCreateWorkspaces,
        },
      }),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['organization', id] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: () => {
      toast.error('Failed to save settings');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => organizationsApi.delete(id),
    onSuccess: () => {
      toast.success('Organization deleted');
      router.replace('/organization');
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: () => {
      toast.error('Failed to delete organization');
    },
  });

  const isOwner = org?.ownerId === currentUser?.id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href={`/organization/${id}/members`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Members
        </Button>
      </Link>

      <h1 className="text-2xl font-semibold mb-6">Organization Settings</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Basic information about your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/logo.png" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limits</CardTitle>
              <CardDescription>Control how many workspaces and members are allowed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="maxWorkspaces"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Workspaces</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxMembers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Max Members
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={500} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="allowMembersToCreateWorkspaces"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Allow Members to Create Workspaces</FormLabel>
                      <FormDescription>
                        When enabled, any member (not just admins) can create new workspaces.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>

      {isOwner && (
        <Card className="mt-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete this organization and unlink all workspaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Organization
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{org?.name}</strong>, remove all members,
                    and unlink all associated workspaces. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={destructiveActionClasses}
                    onClick={() => deleteMutation.mutate()}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
