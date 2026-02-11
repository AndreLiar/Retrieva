---
sidebar_position: 3
---

# State Management

Client-side state management using Zustand and server state with TanStack Query.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        State Management                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   CLIENT STATE (Zustand)              SERVER STATE (React Query)        │
│   ┌────────────────────┐              ┌────────────────────┐            │
│   │ auth-store         │              │ Conversations      │            │
│   │ • user             │              │ • queries          │            │
│   │ • isAuthenticated  │              │ • mutations        │            │
│   └────────────────────┘              │ • cache            │            │
│   ┌────────────────────┐              └────────────────────┘            │
│   │ workspace-store    │              ┌────────────────────┐            │
│   │ • workspaces       │              │ Analytics          │            │
│   │ • activeWorkspace  │              │ • stats            │            │
│   └────────────────────┘              │ • usage data       │            │
│   ┌────────────────────┐              └────────────────────┘            │
│   │ ui-store           │              ┌────────────────────┐            │
│   │ • sidebar          │              │ Notion             │            │
│   │ • modals           │              │ • workspaces       │            │
│   └────────────────────┘              │ • sync status      │            │
│                                       └────────────────────┘            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Zustand Stores

### Auth Store

Manages user authentication and session state.

```typescript
// lib/stores/auth-store.ts

interface User {
  _id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'inactive';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  updateUser: (userData: Partial<User>) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,

      setUser: (user) => set({
        user,
        isAuthenticated: !!user,
      }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(email, password);
          set({ user: data.user, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async (all = false) => {
        await authApi.logout(all);
        set({ user: null, isAuthenticated: false });
        // Clear other stores
        useWorkspaceStore.getState().clearWorkspaces();
      },

      initialize: async () => {
        if (get().isInitialized) return;
        try {
          await get().fetchUser();
        } finally {
          set({ isInitialized: true });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

#### Helper Hooks

```typescript
// Check if user is admin
export function useIsAdmin() {
  return useAuthStore((state) => state.user?.role === 'admin');
}
```

### Workspace Store

Manages workspace selection and membership.

```typescript
// lib/stores/workspace-store.ts

interface WorkspaceWithMembership {
  _id: string;
  name: string;
  description?: string;
  owner: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: {
    canQuery: boolean;
    canViewSources: boolean;
    canInvite: boolean;
    canManageSync: boolean;
    canEditSettings: boolean;
  };
}

interface WorkspaceState {
  workspaces: WorkspaceWithMembership[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface WorkspaceActions {
  setWorkspaces: (workspaces: WorkspaceWithMembership[]) => void;
  setActiveWorkspace: (id: string | null) => void;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<void>;
  updateWorkspace: (id: string, data: Partial<WorkspaceWithMembership>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  clearWorkspaces: () => void;
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,
      error: null,

      setActiveWorkspace: (id) => {
        set({ activeWorkspaceId: id });
        // Persist to localStorage for API header
        if (id) {
          localStorage.setItem('activeWorkspaceId', id);
        } else {
          localStorage.removeItem('activeWorkspaceId');
        }
      },

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await workspacesApi.getWorkspaces();
          set({ workspaces: data.workspaces });

          // Auto-select first workspace if none active
          const { activeWorkspaceId } = get();
          if (!activeWorkspaceId && data.workspaces.length > 0) {
            get().setActiveWorkspace(data.workspaces[0]._id);
          }
        } catch (error) {
          set({ error: 'Failed to load workspaces' });
        } finally {
          set({ isLoading: false });
        }
      },

      clearWorkspaces: () => {
        set({
          workspaces: [],
          activeWorkspaceId: null,
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
```

#### Selector Hooks

```typescript
// Get active workspace details
export function useActiveWorkspace() {
  return useWorkspaceStore((state) =>
    state.workspaces.find((w) => w._id === state.activeWorkspaceId)
  );
}

// Get current workspace role
export function useWorkspaceRole() {
  const workspace = useActiveWorkspace();
  return {
    role: workspace?.role,
    isOwner: workspace?.role === 'owner',
    isAdmin: workspace?.role === 'admin',
    isMember: workspace?.role === 'member',
    isViewer: workspace?.role === 'viewer',
  };
}

// Get current workspace permissions
export function useWorkspacePermissions() {
  const workspace = useActiveWorkspace();
  return workspace?.permissions ?? {
    canQuery: false,
    canViewSources: false,
    canInvite: false,
    canManageSync: false,
    canEditSettings: false,
  };
}
```

### UI Store

Manages UI state like sidebar and modals.

```typescript
// lib/stores/ui-store.ts

export const MODAL_IDS = {
  CREATE_WORKSPACE: 'create-workspace',
  INVITE_MEMBER: 'invite-member',
  DELETE_CONFIRMATION: 'delete-confirmation',
  SETTINGS: 'settings',
} as const;

type ModalId = typeof MODAL_IDS[keyof typeof MODAL_IDS];

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  activeModal: ModalId | null;
  modalData: Record<string, unknown> | null;
  isMobile: boolean;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modalId: ModalId, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setIsMobile: (isMobile: boolean) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activeModal: null,
  modalData: null,
  isMobile: false,

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openModal: (modalId, data = null) =>
    set({ activeModal: modalId, modalData: data }),

  closeModal: () => set({ activeModal: null, modalData: null }),

  setIsMobile: (isMobile) => set({ isMobile }),
}));
```

## React Query Setup

### Query Client Configuration

```typescript
// components/providers/query-provider.tsx

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,         // 1 minute
      gcTime: 5 * 60 * 1000,        // 5 minutes (garbage collection)
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Query Examples

#### Fetching Conversations

```typescript
// Using React Query for server state

function useConversations() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: () => conversationsApi.getConversations(),
    enabled: !!workspaceId,
  });
}

function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => conversationsApi.getConversation(id),
    enabled: !!id,
  });
}
```

#### Mutations

```typescript
function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) =>
      conversationsApi.createConversation(title),
    onSuccess: () => {
      // Invalidate conversations list
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationsApi.deleteConversation(id),
    onSuccess: (_, id) => {
      // Remove from cache immediately
      queryClient.setQueryData(['conversations'], (old: Conversation[]) =>
        old?.filter((c) => c._id !== id)
      );
    },
  });
}
```

### Cache Invalidation

Real-time events trigger cache invalidation:

```typescript
// components/providers/socket-provider.tsx

useEffect(() => {
  socket.on('conversation:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  });

  socket.on('sync:completed', () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  });

  return () => {
    socket.off('conversation:updated');
    socket.off('sync:completed');
  };
}, [socket, queryClient]);
```

## State Synchronization

### Cross-Store Communication

```typescript
// Logout clears all stores
const logout = async () => {
  await authApi.logout();
  useAuthStore.getState().setUser(null);
  useWorkspaceStore.getState().clearWorkspaces();
  queryClient.clear();  // Clear all cached queries
};
```

### Persist Middleware

Zustand's persist middleware saves state to localStorage:

```typescript
persist(
  (set, get) => ({ ... }),
  {
    name: 'store-name',
    partialize: (state) => ({
      // Only persist specific fields
      user: state.user,
    }),
  }
)
```

### Hydration

Handle hydration mismatch between server and client:

```typescript
function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

function Component() {
  const hydrated = useHydration();
  const { user } = useAuthStore();

  if (!hydrated) {
    return <Skeleton />;
  }

  return <UserDisplay user={user} />;
}
```

## Best Practices

### 1. Selective Subscriptions

```typescript
// Good - only re-renders when user changes
const user = useAuthStore((state) => state.user);

// Bad - re-renders on any store change
const { user, isLoading, error } = useAuthStore();
```

### 2. Derived State

```typescript
// Create selectors for derived state
export const selectIsOwner = (state: WorkspaceState) =>
  state.workspaces.find((w) => w._id === state.activeWorkspaceId)?.role === 'owner';

// Use in component
const isOwner = useWorkspaceStore(selectIsOwner);
```

### 3. Action Composition

```typescript
// Compose complex actions
const initializeApp = async () => {
  await useAuthStore.getState().initialize();
  if (useAuthStore.getState().isAuthenticated) {
    await useWorkspaceStore.getState().fetchWorkspaces();
  }
};
```

### 4. Query Key Conventions

```typescript
// Hierarchical query keys
['conversations']                    // List
['conversations', id]                // Single item
['conversations', id, 'messages']    // Nested resource
['analytics', workspaceId, period]   // With parameters
```
