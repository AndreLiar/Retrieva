const ACTIVE_WORKSPACE_STORAGE_KEY = 'activeWorkspaceId';

let activeWorkspaceIdCache: string | null = null;

function hasWindow() {
  return typeof window !== 'undefined';
}

export function getPersistedActiveWorkspaceId(): string | null {
  if (!hasWindow()) return null;

  const workspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  return workspaceId || null;
}

export function getActiveWorkspaceContextId(explicitWorkspaceId?: string | null): string | null {
  if (explicitWorkspaceId) return explicitWorkspaceId;
  if (activeWorkspaceIdCache) return activeWorkspaceIdCache;
  return getPersistedActiveWorkspaceId();
}

export function setActiveWorkspaceContextId(workspaceId: string | null) {
  activeWorkspaceIdCache = workspaceId;

  if (!hasWindow()) return;

  if (workspaceId) {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  } else {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  }
}

export function clearActiveWorkspaceContextId() {
  setActiveWorkspaceContextId(null);
}
