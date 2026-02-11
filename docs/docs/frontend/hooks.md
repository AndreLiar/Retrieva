---
sidebar_position: 4
---

# Custom Hooks

Reusable React hooks for common functionality.

## WebSocket Hooks

### useSocket

Manages Socket.io connection and event handling.

```typescript
// lib/hooks/use-socket.ts

interface UseSocketOptions {
  autoConnect?: boolean;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  error: Error | null;
  on: (event: string, callback: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { autoConnect = true } = options;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      setError(err);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [autoConnect]);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socket?.on(event, callback);
    return () => socket?.off(event, callback);
  }, [socket]);

  const emit = useCallback((event: string, ...args: any[]) => {
    socket?.emit(event, ...args);
  }, [socket]);

  return {
    socket,
    isConnected,
    error,
    on,
    emit,
    disconnect: () => socket?.disconnect(),
    reconnect: () => socket?.connect(),
  };
}
```

### useSyncStatusUpdates

Subscribe to real-time sync progress updates.

```typescript
interface SyncStatusEvent {
  workspaceId: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
  error?: string;
}

export function useSyncStatusUpdates(
  notionWorkspaceId: string,
  onUpdate: (event: SyncStatusEvent) => void
) {
  const { on, emit } = useSocket();

  useEffect(() => {
    // Join workspace room
    emit('join:workspace', notionWorkspaceId);

    // Subscribe to sync events
    const unsubscribe = on('sync:status', (event: SyncStatusEvent) => {
      if (event.workspaceId === notionWorkspaceId) {
        onUpdate(event);
      }
    });

    return () => {
      unsubscribe();
      emit('leave:workspace', notionWorkspaceId);
    };
  }, [notionWorkspaceId, on, emit, onUpdate]);
}
```

### useNotificationUpdates

Subscribe to real-time notifications.

```typescript
interface NotificationEvent {
  _id: string;
  type: 'sync' | 'invitation' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function useNotificationUpdates(
  onNotification: (notification: NotificationEvent) => void
) {
  const { on } = useSocket();

  useEffect(() => {
    return on('notification:new', onNotification);
  }, [on, onNotification]);
}
```

## Streaming Hook

### useStreaming

Handles Server-Sent Events for streaming AI responses.

```typescript
// lib/hooks/use-streaming.ts

type StreamingStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';

interface Source {
  title: string;
  pageId: string;
  url?: string;
  excerpt?: string;
}

interface UseStreamingOptions {
  onComplete?: (content: string, sources: Source[]) => void;
  onError?: (error: Error) => void;
  connectTimeout?: number;  // Default: 30000ms
  totalTimeout?: number;    // Default: 120000ms
}

interface UseStreamingReturn {
  content: string;
  status: StreamingStatus;
  sources: Source[];
  isStreaming: boolean;
  error: Error | null;
  startStreaming: (question: string, conversationId?: string) => void;
  stopStreaming: () => void;
  reset: () => void;
}

export function useStreaming(options: UseStreamingOptions = {}): UseStreamingReturn {
  const {
    onComplete,
    onError,
    connectTimeout = 30000,
    totalTimeout = 120000,
  } = options;

  const [content, setContent] = useState('');
  const [status, setStatus] = useState<StreamingStatus>('idle');
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startStreaming = useCallback(async (question: string, conversationId?: string) => {
    // Reset state
    setContent('');
    setSources([]);
    setError(null);
    setStatus('connecting');

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      abortControllerRef.current?.abort();
      setError(new Error('Connection timeout'));
      setStatus('error');
    }, connectTimeout);

    try {
      const response = await fetch('/api/v1/rag/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': localStorage.getItem('activeWorkspaceId') || '',
        },
        body: JSON.stringify({ question, conversationId }),
        signal: abortControllerRef.current.signal,
        credentials: 'include',
      });

      clearTimeout(connectionTimeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus('streaming');

      // Set total timeout
      timeoutRef.current = setTimeout(() => {
        abortControllerRef.current?.abort();
        setError(new Error('Stream timeout'));
        setStatus('error');
      }, totalTimeout);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'status':
                // Status update
                break;
              case 'sources':
                setSources(data.sources);
                break;
              case 'chunk':
                setContent((prev) => prev + data.text);
                break;
              case 'replace':
                setContent(data.text);
                break;
              case 'done':
                setStatus('complete');
                onComplete?.(content, sources);
                break;
              case 'error':
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
        setStatus('error');
        onError?.(err);
      }
    } finally {
      clearTimeout(timeoutRef.current!);
    }
  }, [connectTimeout, totalTimeout, onComplete, onError]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    clearTimeout(timeoutRef.current!);
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stopStreaming();
    setContent('');
    setSources([]);
    setError(null);
    setStatus('idle');
  }, [stopStreaming]);

  return {
    content,
    status,
    sources,
    isStreaming: status === 'connecting' || status === 'streaming',
    error,
    startStreaming,
    stopStreaming,
    reset,
  };
}
```

## Permission Hooks

### usePermissions

Check user permissions for current workspace.

```typescript
// lib/hooks/use-permissions.ts

interface Permissions {
  canQuery: boolean;
  canViewSources: boolean;
  canInvite: boolean;
  canManageSync: boolean;
  canEditSettings: boolean;
  isWorkspaceOwner: boolean;
  isWorkspaceMember: boolean;
  hasGlobalRole: (role: 'admin' | 'user') => boolean;
  hasWorkspaceRole: (role: 'owner' | 'admin' | 'member' | 'viewer') => boolean;
}

export function usePermissions(): Permissions {
  const user = useAuthStore((s) => s.user);
  const workspace = useActiveWorkspace();

  const permissions = useMemo(() => {
    const wsPermissions = workspace?.permissions ?? {
      canQuery: false,
      canViewSources: false,
      canInvite: false,
      canManageSync: false,
      canEditSettings: false,
    };

    return {
      ...wsPermissions,
      isWorkspaceOwner: workspace?.role === 'owner',
      isWorkspaceMember: !!workspace,
      hasGlobalRole: (role: 'admin' | 'user') => user?.role === role,
      hasWorkspaceRole: (role: 'owner' | 'admin' | 'member' | 'viewer') =>
        workspace?.role === role,
    };
  }, [user, workspace]);

  return permissions;
}
```

### useRequireAuth

Redirect to login if not authenticated.

```typescript
export function useRequireAuth(redirectTo = '/login') {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isInitialized, redirectTo, router]);

  return { isLoading: !isInitialized };
}
```

### useRequireWorkspace

Redirect if no workspace selected.

```typescript
export function useRequireWorkspace(redirectTo = '/workspaces') {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isLoading = useWorkspaceStore((s) => s.isLoading);

  useEffect(() => {
    if (!isLoading && !activeWorkspaceId) {
      router.replace(redirectTo);
    }
  }, [activeWorkspaceId, isLoading, redirectTo, router]);

  return { isLoading };
}
```

## Utility Hooks

### useDebounce

Debounce a value with configurable delay.

```typescript
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      searchApi.search(debouncedQuery);
    }
  }, [debouncedQuery]);
}
```

### useLocalStorage

Sync state with localStorage.

```typescript
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setStoredValue(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key]);

  return [storedValue, setValue];
}
```

### useMediaQuery

Responsive breakpoint detection.

```typescript
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Usage
function ResponsiveComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

### useCopyToClipboard

Copy text to clipboard with feedback.

```typescript
interface UseCopyToClipboardReturn {
  copied: boolean;
  copy: (text: string) => Promise<void>;
  reset: () => void;
}

export function useCopyToClipboard(timeout = 2000): UseCopyToClipboardReturn {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }, []);

  const reset = useCallback(() => {
    setCopied(false);
  }, []);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), timeout);
      return () => clearTimeout(timer);
    }
  }, [copied, timeout]);

  return { copied, copy, reset };
}

// Usage
function CodeBlock({ code }: { code: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div>
      <pre>{code}</pre>
      <Button onClick={() => copy(code)}>
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}
```

### useOnClickOutside

Detect clicks outside an element.

```typescript
export function useOnClickOutside(
  ref: RefObject<HTMLElement>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// Usage
function Dropdown() {
  const ref = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOnClickOutside(ref, () => setIsOpen(false));

  return (
    <div ref={ref}>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && <DropdownContent />}
    </div>
  );
}
```

## Hook Composition

Combine hooks for complex features:

```typescript
// Custom hook for chat functionality
export function useChat(conversationId?: string) {
  const { startStreaming, content, status, sources, reset } = useStreaming({
    onComplete: (content, sources) => {
      // Save message to conversation
      createMessage.mutate({ content, sources });
    },
  });

  const createMessage = useMutation({
    mutationFn: (data: CreateMessageInput) =>
      conversationsApi.createMessage(conversationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['conversation', conversationId]);
    },
  });

  const sendMessage = useCallback((question: string) => {
    startStreaming(question, conversationId);
  }, [startStreaming, conversationId]);

  return {
    sendMessage,
    content,
    status,
    sources,
    reset,
    isLoading: status === 'connecting' || status === 'streaming',
  };
}
```
