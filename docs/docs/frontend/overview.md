---
sidebar_position: 1
---

# Frontend Overview

Modern React/Next.js frontend with TypeScript, Zustand state management, and real-time capabilities.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.9.x | Type safety |
| Zustand | 5.x | Client state management |
| TanStack Query | 5.x | Server state & caching |
| Tailwind CSS | 3.x | Styling |
| Radix UI | - | Headless components |
| Socket.io | 4.x | Real-time communication |

## Directory Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (login, register, etc.)
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   ├── layout.tsx          # Root layout with providers
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── chat/               # Chat feature components
│   │   ├── layout/             # Layout components (sidebar, header)
│   │   ├── analytics/          # Analytics dashboard
│   │   ├── notion/             # Notion integration
│   │   ├── providers/          # Context providers
│   │   ├── common/             # Shared components
│   │   └── ui/                 # Radix UI components
│   ├── lib/
│   │   ├── api/                # API layer (Axios)
│   │   ├── stores/             # Zustand stores
│   │   ├── hooks/              # Custom React hooks
│   │   └── utils/              # Utility functions
│   ├── types/                  # TypeScript definitions
│   └── tests/                  # Unit tests
├── public/                     # Static assets
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Frontend Architecture                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Presentation Layer                                              │   │
│   │  • React Components                                              │   │
│   │  • Radix UI primitives                                          │   │
│   │  • Tailwind styling                                             │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  State Management                                                │   │
│   │  • Zustand (auth, workspace, UI)                                │   │
│   │  • React Query (server state)                                   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Data Layer                                                      │   │
│   │  • API client (Axios)                                           │   │
│   │  • WebSocket (Socket.io)                                        │   │
│   │  • SSE (streaming)                                              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Route Structure

### Auth Routes `(auth)/`

| Route | Description |
|-------|-------------|
| `/login` | User login |
| `/register` | User registration |
| `/forgot-password` | Password reset request |
| `/reset-password` | Password reset form |
| `/verify-email` | Email verification |

### Dashboard Routes `(dashboard)/`

| Route | Description | Permission |
|-------|-------------|------------|
| `/assessments` | DORA third-party ICT risk assessments | All members |
| `/copilot` | DORA compliance AI copilot (Q&A) | All members |
| `/sources` | Data sources hub (Notion + coming soon: files, Confluence, URLs) | Owner/Member |
| `/conversations` | Conversation history | All members |
| `/analytics` | Usage analytics | Owner/Member |
| `/members` | Member management | Owner only |
| `/workspaces` | Workspace management | All members |
| `/notifications` | Notifications | All members |
| `/settings` | User settings | All members |
| `/chat` | Redirects to `/copilot` (backwards compat) | — |
| `/notion` | Notion workspace integration settings | Owner/Member |

## Provider Hierarchy

```jsx
<ThemeProvider>           // Dark/light theme
  <QueryProvider>         // React Query client
    <AuthProvider>        // Session initialization
      <SocketProvider>    // WebSocket events
        {children}
      </SocketProvider>
    </AuthProvider>
  </QueryProvider>
</ThemeProvider>
```

## Key Features

### Real-Time Updates

- **WebSocket connection** for live notifications
- **Sync status monitoring** during Notion syncs
- **Conversation updates** across sessions

### Streaming Responses

- **Server-Sent Events** for progressive AI responses
- **Timeout handling** with graceful degradation
- **Source citations** displayed with responses

### Multi-Workspace Support

- **Workspace switcher** in sidebar
- **Role-based navigation** per workspace
- **Persistent workspace selection**

### Security

- **HTTP-only cookies** for authentication
- **Content sanitization** with DOMPurify
- **Permission guards** on routes and components
- **Token refresh** with exponential backoff

## Configuration

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3007/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3007
```

### API Client Configuration

```typescript
// lib/api/client.ts
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
  withCredentials: true,  // HTTP-only cookies
});
```

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,    // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

## Development

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Unit tests
npm run test
```

## Build

```bash
# Production build
npm run build

# Start production server
npm start
```
