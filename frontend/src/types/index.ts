// API Response Types
export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  status: 'success';
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    itemsPerPage: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// User Types
export type GlobalRole = 'user' | 'admin';
export type WorkspaceRole = 'owner' | 'member' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  isEmailVerified?: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Workspace Types
export interface WorkspacePermissions {
  canQuery: boolean;
  canViewSources: boolean;
  canInvite: boolean;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
  status: 'active' | 'pending' | 'revoked';
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'idle' | 'syncing' | 'error' | 'completed';
  lastSyncAt?: string;
}

// Raw backend response from /workspaces/my-workspaces
// ISSUE #52 FIX: Proper typing for backend workspace response
export interface WorkspaceApiResponse {
  id: string;
  workspaceName?: string;
  name?: string;
  workspaceIcon?: string;
  syncStatus?: 'idle' | 'syncing' | 'error' | 'completed';
  stats?: {
    totalDocuments: number;
    pageCount: number;
    databaseCount: number;
  };
  myRole?: WorkspaceRole;
  role?: WorkspaceRole;
  permissions?: WorkspacePermissions;
  joinedAt?: string;
  description?: string;
}

// Normalized workspace with membership (frontend format)
export interface WorkspaceWithMembership {
  id: string;
  workspaceName: string;
  workspaceIcon?: string;
  syncStatus: 'idle' | 'syncing' | 'error' | 'completed';
  stats?: {
    totalDocuments: number;
    pageCount: number;
    databaseCount: number;
  };
  myRole: WorkspaceRole;
  permissions: WorkspacePermissions;
  joinedAt: string;
  description?: string;
  // Computed for compatibility
  name: string;
  membership: {
    role: WorkspaceRole;
    permissions: WorkspacePermissions;
    status: 'active' | 'pending' | 'revoked';
  };
}

// Conversation Types
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  feedback?: 'positive' | 'negative' | null;
  createdAt: string;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  url?: string;
  pageId?: string;
  score?: number;
}

export interface Conversation {
  id: string;
  title: string;
  workspaceId: string;
  userId: string;
  isPinned: boolean;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// Notion Types
export type TokenStatus = 'valid' | 'expired' | 'invalid' | 'revoked' | 'unknown';

export interface NotionWorkspace {
  id: string;
  notionWorkspaceId: string;
  workspaceId: string;
  name: string;
  icon?: string;
  accessToken?: string;
  syncStatus: 'idle' | 'syncing' | 'error' | 'completed' | 'active' | 'token_expired';
  lastSyncAt?: string;
  lastSyncError?: string;
  pagesCount: number;
  createdAt: string;
  updatedAt: string;
  // Token health fields
  tokenStatus?: TokenStatus;
  tokenLastValidated?: string;
  tokenInvalidatedAt?: string;
}

export interface TokenHealthWorkspace {
  workspaceId: string;
  workspaceName: string;
  tokenStatus: TokenStatus;
  lastValidated: string | null;
  invalidatedAt: string | null;
  syncStatus: string;
  needsReconnect: boolean;
}

export interface SyncJob {
  id: string;
  notionWorkspaceId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  pagesProcessed: number;
  totalPages: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// Analytics Types
export interface AnalyticsSummary {
  totalQuestions: number;
  totalConversations: number;
  averageResponseTime: number;
  satisfactionRate: number;
  cacheHitRate: number;
}

export interface UsageDataPoint {
  date: string;
  questions: number;
  conversations: number;
}

export interface FeedbackDataPoint {
  rating: 'positive' | 'negative';
  count: number;
}

export interface PopularQuestion {
  question: string;
  count: number;
  lastAsked: string;
}

// Notification Types
export type NotificationType =
  | 'sync_complete'
  | 'sync_failed'
  | 'member_invited'
  | 'member_joined'
  | 'workspace_created'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

// Form Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

// RAG Types
export interface RAGQuestion {
  question: string;
  conversationId?: string;
}

export interface RAGResponse {
  answer: string;
  sources: Source[];
  conversationId: string;
  messageId: string;
  confidence?: number;
  cached?: boolean;
}

// Organization Types (Phase 2a)
export type OrgRole = 'org-admin' | 'billing-admin' | 'auditor' | 'member';
export type OrgPlan = 'free' | 'team' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  ownerId: string;
  plan: OrgPlan;
  status: 'active' | 'suspended';
  settings: {
    maxWorkspaces: number;
    maxMembers: number;
    allowMembersToCreateWorkspaces: boolean;
  };
  memberCount?: number;
  workspaceCount?: number;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  user: { id: string; name: string; email: string };
  role: OrgRole;
  status: 'active' | 'pending' | 'revoked';
}

export interface LinkedWorkspace {
  id: string;
  workspaceName: string;
  workspaceIcon?: string;
  syncStatus: string;
  stats?: { totalDocuments: number };
  createdAt: string;
}

// Streaming Event Types
export type StreamEventType =
  | 'status'
  | 'chunk'
  | 'sources'
  | 'done'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  data: string;
}
