---
sidebar_position: 2
---

# Components

Reusable React components organized by feature and functionality.

## Component Organization

```
components/
├── chat/           # Chat feature components
├── layout/         # Layout structure
├── analytics/      # Analytics dashboard
├── notion/         # Notion integration
├── providers/      # Context providers
├── common/         # Shared/utility components
├── theme/          # Theme switching
└── ui/             # Radix UI primitives
```

## Chat Components

### ChatInterface

Main chat container managing conversation flow.

```tsx
// components/chat/chat-interface.tsx

interface ChatInterfaceProps {
  conversationId?: string;
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  // Manages conversation state, streaming, and messages
}
```

### MessageList

Renders conversation messages with virtualization.

```tsx
interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}
```

### MessageBubble

Individual message display with formatting.

```tsx
interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}
```

Features:
- Markdown rendering
- Code syntax highlighting
- Copy to clipboard
- Feedback buttons

### StreamingMessage

Handles progressive content display during streaming.

```tsx
interface StreamingMessageProps {
  content: string;
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
  sources: Source[];
}
```

### SourceCitations

Displays document sources for AI responses.

```tsx
interface SourceCitationsProps {
  sources: Source[];
  expandable?: boolean;
}
```

### ChatInput

Message input with submit handling.

```tsx
interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

## Layout Components

### Sidebar

Main navigation sidebar with collapsible sections.

```tsx
// components/layout/sidebar.tsx

export function Sidebar() {
  const { sidebarCollapsed } = useUIStore();
  const { role } = useWorkspaceRole();

  return (
    <nav className={cn(
      "flex flex-col h-full",
      sidebarCollapsed && "w-16"
    )}>
      <WorkspaceSwitcher />
      <NavLinks role={role} />
      <UserNav />
    </nav>
  );
}
```

### MobileSidebar

Sheet-based sidebar for mobile devices.

```tsx
export function MobileSidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left">
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
```

### Header

Top navigation bar containing the notification badge, theme toggle, and user menu.

The notification badge uses a **WebSocket-first, poll-as-safety-net** strategy to avoid burning the API rate limit budget:

1. **Mount** — one HTTP call to `GET /notifications/count` fetches the initial count.
2. **Real-time** — `SocketProvider` listens for `notification:new` socket events and calls `queryClient.setQueryData` to increment the badge count in-place. No HTTP request is made per notification.
3. **Reconciliation** — a background poll fires every **5 minutes** (`refetchInterval: 300_000`) to correct any drift from missed socket events.
4. `refetchOnWindowFocus: false` prevents tab-switch focus events from firing extra requests.

```tsx
// components/layout/header.tsx
export function Header() {
  const { data: notificationData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await notificationsApi.getUnreadCount();
      return response.data?.unreadCount ?? 0;
    },
    refetchInterval: 300_000,    // 5-minute reconciliation poll
    refetchOnWindowFocus: false, // socket push handles real-time
  });

  const unreadCount = notificationData || 0;
  // ...badge renders unreadCount, capped at "9+" display
}
```

The `SocketProvider` (see Providers below) owns the `setQueryData` increment so the logic is centralised and the `Header` itself requires no socket awareness.

### WorkspaceSwitcher

Dropdown for switching between workspaces.

```tsx
export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const activeWorkspace = useActiveWorkspace();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {activeWorkspace?.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {workspaces.map(workspace => (
          <DropdownMenuItem
            key={workspace._id}
            onClick={() => setActiveWorkspace(workspace._id)}
          >
            {workspace.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Analytics Components

### StatsCards

Key metrics display.

```tsx
interface StatsCardsProps {
  stats: {
    totalQueries: number;
    avgResponseTime: number;
    userSatisfaction: number;
    documentsIndexed: number;
  };
}
```

### UsageChart

Query volume over time (Recharts).

```tsx
interface UsageChartProps {
  data: {
    date: string;
    queries: number;
  }[];
  period: 'day' | 'week' | 'month';
}
```

### FeedbackChart

User feedback distribution.

```tsx
interface FeedbackChartProps {
  positive: number;
  negative: number;
  neutral: number;
}
```

### PopularQuestions

Most frequently asked questions.

```tsx
interface PopularQuestionsProps {
  questions: {
    question: string;
    count: number;
    avgConfidence: number;
  }[];
}
```

## Notion Components

### WorkspaceCard

Connected Notion workspace display.

```tsx
interface WorkspaceCardProps {
  workspace: NotionWorkspace;
  onSync: () => void;
  onDisconnect: () => void;
}
```

### SyncStatus

Real-time sync progress indicator.

```tsx
interface SyncStatusProps {
  workspaceId: string;
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  progress?: {
    current: number;
    total: number;
  };
}
```

### SyncProgressPanel

Detailed sync progress with stages.

```tsx
export function SyncProgressPanel({ workspaceId }: { workspaceId: string }) {
  // Subscribes to Socket.io sync events
  useSyncStatusUpdates(workspaceId, handleUpdate);

  return (
    <div>
      <Progress value={progress} />
      <SyncStages stages={stages} />
      <SyncLogs logs={recentLogs} />
    </div>
  );
}
```

### TokenHealthBanner

OAuth token status warning.

```tsx
interface TokenHealthBannerProps {
  isHealthy: boolean;
  expiresAt?: Date;
  onRefresh: () => void;
}
```

## Providers

### SocketProvider

`components/providers/socket-provider.tsx` is a global provider that bridges Socket.io events into the React Query cache. It owns all real-time cache mutations so individual components stay stateless with respect to WebSocket logic.

| Socket event | Action |
|---|---|
| `notification:new` | `setQueryData(['notifications', 'unread-count'], old + 1)` + invalidate list queries only |
| `sync:status` | Invalidate all `notion-workspaces` / `notion-sync-*` queries + show toast |
| `workspace:update` | Invalidate `workspaces` and `workspace-members` queries |
| `conversation:update` | Invalidate `conversations` queries |

The `notification:new` handler uses `setQueryData` (not `invalidateQueries`) for the unread count to avoid an unnecessary HTTP round-trip. A `predicate` filter on `invalidateQueries` ensures the count cache key (`['notifications', 'unread-count']`) is excluded from the list invalidation that accompanies each new notification event.

```tsx
// Notification handler in SocketProvider
on<NotificationEvent>('notification:new', (notification) => {
  // Increment badge count with no HTTP call
  queryClient.setQueryData<number>(
    ['notifications', 'unread-count'],
    (old) => (old ?? 0) + 1
  );

  // Invalidate list queries only (count key is intentionally excluded)
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return key[0] === 'notifications' && key[1] !== 'unread-count';
    },
  });
});
```

## Common Components

### RequirePermission

Permission guard component.

```tsx
interface RequirePermissionProps {
  permission: 'canQuery' | 'canViewSources' | 'canInvite' | 'canManageSync';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequirePermission({
  permission,
  fallback = null,
  children,
}: RequirePermissionProps) {
  const permissions = usePermissions();

  if (!permissions[permission]) {
    return fallback;
  }

  return children;
}
```

### RequireRole

Role-based access guard.

```tsx
interface RequireRoleProps {
  role: 'admin' | 'owner';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
```

### RequireWorkspaceRole

Workspace-specific role guard.

```tsx
interface RequireWorkspaceRoleProps {
  roles: ('owner' | 'admin' | 'member' | 'viewer')[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
```

### ViewerBanner

Read-only mode indicator.

```tsx
export function ViewerBanner() {
  const { role } = useWorkspaceRole();

  if (role !== 'viewer') return null;

  return (
    <Alert variant="info">
      You have view-only access to this workspace.
    </Alert>
  );
}
```

## UI Components (Radix)

Radix UI primitives styled with Tailwind:

| Component | Description |
|-----------|-------------|
| `Button` | Action buttons with variants |
| `Dialog` | Modal dialogs |
| `DropdownMenu` | Context menus |
| `Input` | Text inputs |
| `Select` | Dropdown selects |
| `Table` | Data tables |
| `Tabs` | Tab navigation |
| `Toast` | Notifications (Sonner) |
| `Sheet` | Side panels |
| `Card` | Content containers |
| `Badge` | Status indicators |
| `Avatar` | User avatars |
| `Skeleton` | Loading placeholders |
| `Progress` | Progress bars |
| `Tooltip` | Hover tooltips |

## Component Patterns

### Loading States

```tsx
function DataComponent() {
  const { data, isLoading } = useQuery(...);

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  return <DataDisplay data={data} />;
}
```

### Error Boundaries

```tsx
// components/error-boundary.tsx

export function ErrorBoundary({ children }) {
  return (
    <ErrorBoundaryPrimitive fallback={<ErrorFallback />}>
      {children}
    </ErrorBoundaryPrimitive>
  );
}

function ErrorFallback({ error, reset }) {
  return (
    <div className="p-4 text-center">
      <h2>Something went wrong</h2>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

### Form Handling

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function SettingsForm() {
  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ... },
  });

  return (
    <Form {...form}>
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
    </Form>
  );
}
```

### Responsive Design

```tsx
function ResponsiveComponent() {
  const { isMobile } = useUIStore();

  return (
    <div className={cn(
      "grid gap-4",
      isMobile ? "grid-cols-1" : "grid-cols-3"
    )}>
      {/* Content */}
    </div>
  );
}
```
