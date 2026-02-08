'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users, AlertTriangle } from 'lucide-react';

import { useWorkspaceStore, useActiveWorkspace } from '@/lib/stores/workspace-store';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Members page - redirects to the active workspace's members management page.
 * Only accessible by workspace owners.
 */
export default function MembersPage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const isLoading = useWorkspaceStore((state) => state.isLoading);

  useEffect(() => {
    // Redirect to the active workspace's members page
    if (activeWorkspace && activeWorkspace.membership?.role === 'owner') {
      router.replace(`/workspaces/${activeWorkspace.id}/members`);
    }
  }, [activeWorkspace, router]);

  // Show loading while determining where to redirect
  if (isLoading || (activeWorkspace && activeWorkspace.membership?.role === 'owner')) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading members...</p>
        </div>
      </div>
    );
  }

  // No active workspace or not an owner
  if (!activeWorkspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <Users className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Workspace Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Please select a workspace first to manage its members.
        </p>
        <Link href="/workspaces">
          <Button>Go to Workspaces</Button>
        </Link>
      </div>
    );
  }

  // User is not an owner of this workspace
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <AlertTriangle className="h-12 w-12 text-yellow-500" />
      <h2 className="text-xl font-semibold">Access Restricted</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Only workspace owners can manage members. Your role in "{activeWorkspace.name}" is{' '}
        <span className="font-medium">{activeWorkspace.membership?.role}</span>.
      </p>
      <Link href="/workspaces">
        <Button variant="outline">Back to Workspaces</Button>
      </Link>
    </div>
  );
}
