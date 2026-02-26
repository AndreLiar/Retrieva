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

