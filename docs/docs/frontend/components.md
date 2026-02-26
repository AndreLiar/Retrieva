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
├── sources/        # Data source management (file, url, confluence, MCP)
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

Top navigation with search and user menu.

```tsx
export function Header() {
  return (
    <header className="h-16 border-b flex items-center justify-between px-4">
      <Breadcrumbs />
      <div className="flex items-center gap-4">
        <SearchCommand />
        <NotificationBell />
        <UserNav />
      </div>
    </header>
  );
}
```

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

## Sources Components

Components in `components/sources/` drive the **Sources** page (`/sources`) where users connect and manage all data sources.

### DataSourceCard

Card for file, URL, and Confluence sources (native ingestion).

```tsx
interface DataSourceCardProps {
  source: DataSource;       // status, stats, lastSyncedAt
  workspaceId: string;
}
```

Shows source type icon, status badge (pending / syncing / active / error), document count, last sync date, and sync/delete actions gated by `RequirePermission`.

### FileUploadDialog

Dialog for uploading a PDF, DOCX, or XLSX file (max 25 MB). Submits as `multipart/form-data` via `sourcesApi.create()`.

### UrlAddDialog

Dialog for indexing a public web URL. Submits as JSON `{ sourceType: 'url', config: { url } }`.

### ConfluenceConnectDialog

Dialog for connecting Confluence Cloud. Fields: base URL, space key, email, API token (password). Submits as JSON with encrypted API token stored server-side.

### MCPServerCard

Card for MCP-connected external servers.

```tsx
interface MCPServerCardProps {
  source: MCPSource;
  workspaceId: string;
}
```

- Source type icons: `Layers` (Confluence), `HardDrive` (Google Drive), `GitBranch` (GitHub), `TicketCheck` (Jira), `MessageSquare` (Slack), `Plug` (custom)
- Status badges: pending · syncing (animated) · active · paused · error
- Shows documents indexed, last sync date, auto-sync interval, and last error string
- Sync and delete buttons gated by `RequirePermission permission="canTriggerSync"`

### MCPConnectDialog

Dialog for registering a new MCP server. Fields: name, source type (Select), server URL + inline "Test" button, auth token (optional, password), auto-sync toggle (Switch), sync interval hours.

The **Test** button calls `mcpApi.testConnection()` directly (not via React Query mutation) and displays green/red inline feedback below the URL field before the user submits.

```tsx
interface MCPConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}
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
