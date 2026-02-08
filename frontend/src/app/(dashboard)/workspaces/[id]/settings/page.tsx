'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
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
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { workspacesApi } from '@/lib/api';
import { createWorkspaceSchema, type CreateWorkspaceFormData } from '@/lib/utils/validation';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface WorkspaceSettingsPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const { isWorkspaceOwner } = usePermissions();

  const workspace = workspaces.find((w) => w.id === id);

  const form = useForm<CreateWorkspaceFormData>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: workspace?.name || '',
      description: workspace?.description || '',
    },
  });

  // Update form when workspace loads
  useEffect(() => {
    if (workspace) {
      form.reset({
        name: workspace.name,
        description: workspace.description || '',
      });
    }
  }, [workspace, form]);

  // Redirect if not owner
  useEffect(() => {
    if (workspace && !isWorkspaceOwner) {
      router.replace(`/workspaces/${id}`);
      toast.error('You do not have permission to access workspace settings');
    }
  }, [workspace, isWorkspaceOwner, router, id]);

  const updateMutation = useMutation({
    mutationFn: async (data: CreateWorkspaceFormData) => {
      await updateWorkspace(id, data);
    },
    onSuccess: () => {
      toast.success('Workspace updated successfully');
    },
    onError: () => {
      toast.error('Failed to update workspace');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteWorkspace(id);
    },
    onSuccess: () => {
      toast.success('Workspace deleted');
      router.push('/workspaces');
    },
    onError: () => {
      toast.error('Failed to delete workspace');
    },
  });

  if (!workspace || !isWorkspaceOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href={`/workspaces/${id}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Workspace
        </Button>
      </Link>

      <h1 className="text-2xl font-semibold mb-6">Workspace Settings</h1>

      {/* General Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Update your workspace name and description
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
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
                      <Textarea
                        placeholder="What is this workspace for?"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A brief description of what this workspace is used for
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Workspace</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this workspace and all its data
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the
                    workspace "{workspace.name}" and all associated data including
                    conversations, documents, and member access.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Delete Workspace'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
