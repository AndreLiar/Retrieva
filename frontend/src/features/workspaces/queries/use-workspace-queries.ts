'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { workspacesApi } from '@/features/workspaces/api/workspaces';
import { useWorkspaceStore } from '@/state/workspace-store';
import type { WorkspaceWithMembership } from '@/types';

export function useWorkspaceListQuery() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await workspacesApi.list();
      return response.data?.workspaces ?? [];
    },
  });

  useEffect(() => {
    if (!query.isSuccess) return;

    const workspaces = query.data;
    if (workspaces.length === 0) {
      if (activeWorkspaceId) {
        setActiveWorkspace(null);
      }
      return;
    }

    const hasActiveWorkspace = activeWorkspaceId
      ? workspaces.some((workspace) => workspace.id === activeWorkspaceId)
      : false;

    if (!hasActiveWorkspace) {
      setActiveWorkspace(workspaces[0].id);
    }
  }, [query.data, query.isSuccess, activeWorkspaceId, setActiveWorkspace]);

  return query;
}

export function useWorkspaceQuery(workspaceId?: string | null) {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const response = await workspacesApi.get(workspaceId);
      return response.data?.workspace ?? null;
    },
    enabled: !!workspaceId,
  });
}

export function useActiveWorkspace(): WorkspaceWithMembership | null {
  const { data: workspaces } = useWorkspaceListQuery();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  return useMemo(() => {
    if (!workspaces?.length || !activeWorkspaceId) return null;
    return workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  }, [workspaces, activeWorkspaceId]);
}

export function useWorkspaceRole() {
  const workspace = useActiveWorkspace();
  return workspace?.membership.role ?? null;
}

export function useWorkspacePermissions() {
  const workspace = useActiveWorkspace();
  return workspace?.membership.permissions ?? null;
}
