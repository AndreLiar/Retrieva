'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Landmark, Users, Database } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { organizationsApi } from '@/lib/api';
import type { OrgPlan } from '@/types';

const createOrgSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

type CreateOrgForm = z.infer<typeof createOrgSchema>;

const planBadgeColor: Record<OrgPlan, string> = {
  free: 'bg-gray-100 text-gray-700',
  team: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const response = await organizationsApi.list();
      return response.data?.organizations ?? [];
    },
  });

  const form = useForm<CreateOrgForm>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: '', description: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateOrgForm) => organizationsApi.create(data),
    onSuccess: () => {
      toast.success('Organization created');
      setCreateDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: () => {
      toast.error('Failed to create organization');
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="text-muted-foreground">Manage your organizations and their workspaces</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Set up a new organization to group workspaces and manage team access.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
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
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of your organization"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Create
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-1">No organizations yet</h2>
          <p className="text-muted-foreground mb-6">
            Create an organization to manage workspaces and team members at scale.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Organization
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map(({ org, role }) => (
            <Link key={org.id} href={`/organization/${org.id}/members`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    <Badge className={planBadgeColor[org.plan]} variant="secondary">
                      {org.plan}
                    </Badge>
                  </div>
                  {org.description && (
                    <CardDescription className="line-clamp-2">{org.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {org.memberCount ?? 0} members
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="h-3.5 w-3.5" />
                      {org.workspaceCount ?? 0} workspaces
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground capitalize">
                    Your role: <span className="font-medium">{role}</span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
