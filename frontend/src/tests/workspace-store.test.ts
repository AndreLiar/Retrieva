import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

import { useWorkspaceStore } from '@/lib/stores/workspace-store';

describe('Workspace Store', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      activeWorkspaceId: null,
    });

    window.localStorage.clear();
  });

  it('starts with no active workspace', () => {
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });

  it('setActiveWorkspace stores the selected workspace id', () => {
    act(() => {
      useWorkspaceStore.getState().setActiveWorkspace('ws-123');
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-123');
  });

  it('clearActiveWorkspace clears the selected workspace id', () => {
    act(() => {
      useWorkspaceStore.getState().setActiveWorkspace('ws-123');
      useWorkspaceStore.getState().clearActiveWorkspace();
    });

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });

  it('persists workspace selection in local storage middleware', () => {
    act(() => {
      useWorkspaceStore.getState().setActiveWorkspace('ws-456');
    });

    const serialized = window.localStorage.getItem('workspace-storage');

    expect(serialized).toContain('"activeWorkspaceId":"ws-456"');
  });
});
