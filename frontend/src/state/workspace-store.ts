import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  clearActiveWorkspaceContextId,
  setActiveWorkspaceContextId,
} from '@/shared/lib/workspace-context';

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  clearActiveWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,

      setActiveWorkspace: (workspaceId) => {
        set({ activeWorkspaceId: workspaceId });
        setActiveWorkspaceContextId(workspaceId);
      },

      clearActiveWorkspace: () => {
        set({ activeWorkspaceId: null });
        clearActiveWorkspaceContextId();
      },
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
      onRehydrateStorage: () => (state) => {
        setActiveWorkspaceContextId(state?.activeWorkspaceId ?? null);
      },
    }
  )
);
