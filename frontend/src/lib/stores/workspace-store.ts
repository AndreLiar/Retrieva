import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Workspace,
  WorkspaceWithMembership,
  WorkspaceApiResponse,
  WorkspaceRole,
  WorkspacePermissions,
} from '@/types';
import { workspacesApi } from '@/lib/api';

interface WorkspaceState {
  workspaces: WorkspaceWithMembership[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;

  // Computed getters
  activeWorkspace: WorkspaceWithMembership | null;

  // Actions
  setWorkspaces: (workspaces: WorkspaceWithMembership[]) => void;
  setActiveWorkspace: (workspaceId: string | null) => void;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: import('@/lib/api/workspaces').UpdateWorkspaceData) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  clearWorkspaces: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,
      error: null,

      get activeWorkspace() {
        const state = get();
        return state.workspaces.find((w) => w.id === state.activeWorkspaceId) || null;
      },

      setWorkspaces: (workspaces) => {
        set({ workspaces });
        // If no active workspace, set the first one
        const state = get();
        if (!state.activeWorkspaceId && workspaces.length > 0) {
          const firstWorkspace = workspaces[0];
          set({ activeWorkspaceId: firstWorkspace.id });
          localStorage.setItem('activeWorkspaceId', firstWorkspace.id);
        }
      },

      setActiveWorkspace: (workspaceId) => {
        set({ activeWorkspaceId: workspaceId });
        if (workspaceId) {
          localStorage.setItem('activeWorkspaceId', workspaceId);
        } else {
          localStorage.removeItem('activeWorkspaceId');
        }
      },

      fetchWorkspaces: async () => {
        // ISSUE #42 FIX: Prevent concurrent fetch calls
        // If already loading, skip this call to prevent race conditions
        const state = get();
        if (state.isLoading) {
          console.log('[WorkspaceStore] fetchWorkspaces skipped - already loading');
          return;
        }

        console.log('[WorkspaceStore] fetchWorkspaces called');
        set({ isLoading: true, error: null });
        try {
          console.log('[WorkspaceStore] Calling workspacesApi.list()...');
          const response = await workspacesApi.list();
          console.log('[WorkspaceStore] API response:', response);
          if (response.status === 'success' && response.data) {
            // ISSUE #52 FIX: Transform backend response to expected format with proper typing
            const workspaces: WorkspaceWithMembership[] = response.data.workspaces.map(
              (w: WorkspaceApiResponse): WorkspaceWithMembership => ({
                id: w.id,
                workspaceName: w.workspaceName || w.name || '',
                workspaceIcon: w.workspaceIcon,
                syncStatus: w.syncStatus || 'idle',
                stats: w.stats,
                myRole: w.myRole || w.role || 'viewer',
                permissions: w.permissions || {
                  canQuery: true,
                  canViewSources: true,
                  canInvite: false,
                },
                joinedAt: w.joinedAt || new Date().toISOString(),
                description: w.description,
                // Add name alias for workspaceName (for compatibility)
                name: w.workspaceName || w.name || '',
                // Add nested membership object for components expecting it
                membership: {
                  role: w.myRole || w.role || 'viewer',
                  permissions: w.permissions || {
                    canQuery: true,
                    canViewSources: true,
                    canInvite: false,
                  },
                  status: 'active' as const,
                },
                // Vendor profile fields
                vendorTier: w.vendorTier,
                country: w.country,
                serviceType: w.serviceType,
                contractStart: w.contractStart,
                contractEnd: w.contractEnd,
                nextReviewDate: w.nextReviewDate,
                vendorStatus: w.vendorStatus,
                certifications: w.certifications,
                vendorFunctions: w.vendorFunctions,
                exitStrategyDoc: w.exitStrategyDoc,
              })
            );
            set({ workspaces, isLoading: false });

            // Set or validate active workspace
            const state = get();
            const currentActiveId = state.activeWorkspaceId;
            const savedId = localStorage.getItem('activeWorkspaceId');

            // Check if current active workspace is valid
            const currentIsValid = currentActiveId && workspaces.find((ws) => ws.id === currentActiveId);

            if (!currentIsValid && workspaces.length > 0) {
              // Try saved ID first, then fall back to first workspace
              const savedIsValid = savedId && workspaces.find((ws) => ws.id === savedId);
              const activeId = savedIsValid ? savedId : workspaces[0].id;

              console.log('[WorkspaceStore] Setting active workspace:', activeId, '(was:', currentActiveId, ')');
              set({ activeWorkspaceId: activeId });
              localStorage.setItem('activeWorkspaceId', activeId);
            }
          }
        } catch (error) {
          console.error('[WorkspaceStore] fetchWorkspaces error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch workspaces',
            isLoading: false,
          });
        }
      },

      createWorkspace: async (name, description) => {
        set({ isLoading: true, error: null });
        try {
          const response = await workspacesApi.create({ name, description });
          if (response.status === 'success' && response.data) {
            // Refetch workspaces to get the full membership data
            await get().fetchWorkspaces();
            return response.data.workspace;
          }
          throw new Error('Failed to create workspace');
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create workspace',
            isLoading: false,
          });
          throw error;
        }
      },

      updateWorkspace: async (id, data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await workspacesApi.update(id, data);
          if (response.status === 'success' && response.data) {
            // Update the workspace in the list
            set((state) => ({
              workspaces: state.workspaces.map((w) =>
                w.id === id ? { ...w, ...response.data!.workspace } : w
              ),
              isLoading: false,
            }));
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update workspace',
            isLoading: false,
          });
          throw error;
        }
      },

      deleteWorkspace: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await workspacesApi.delete(id);
          set((state) => {
            const newWorkspaces = state.workspaces.filter((w) => w.id !== id);
            const newActiveId =
              state.activeWorkspaceId === id
                ? newWorkspaces[0]?.id || null
                : state.activeWorkspaceId;

            if (newActiveId) {
              localStorage.setItem('activeWorkspaceId', newActiveId);
            } else {
              localStorage.removeItem('activeWorkspaceId');
            }

            return {
              workspaces: newWorkspaces,
              activeWorkspaceId: newActiveId,
              isLoading: false,
            };
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete workspace',
            isLoading: false,
          });
          throw error;
        }
      },

      clearWorkspaces: () => {
        set({
          workspaces: [],
          activeWorkspaceId: null,
          error: null,
        });
        localStorage.removeItem('activeWorkspaceId');
      },
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useActiveWorkspace = () => {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeWorkspaceId) || null;
};

export const useWorkspaceRole = (): WorkspaceRole | null => {
  const workspace = useActiveWorkspace();
  return workspace?.membership.role || null;
};

export const useWorkspacePermissions = (): WorkspacePermissions | null => {
  const workspace = useActiveWorkspace();
  return workspace?.membership.permissions || null;
};
