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

export interface UserOrganization {
  id: string;
  name: string;
  industry: string;
  country: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  isEmailVerified?: boolean;
  createdAt?: string;
  lastLogin?: string;
  organizationId?: string | null;
  organization?: UserOrganization | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  needsOrganization?: boolean;
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
  vendorTier?: VendorTier | null;
  country?: string;
  serviceType?: VendorServiceType | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  nextReviewDate?: string | null;
  vendorStatus?: VendorStatus;
  certifications?: VendorCertification[];
  vendorFunctions?: VendorFunction[];
  exitStrategyDoc?: string | null;
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
  vendorTier?: VendorTier | null;
  country?: string;
  serviceType?: VendorServiceType | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  nextReviewDate?: string | null;
  vendorStatus?: VendorStatus;
  certifications?: VendorCertification[];
  vendorFunctions?: VendorFunction[];
  exitStrategyDoc?: string | null;
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
  // Vendor profile fields (DORA Article 28)
  vendorTier?: VendorTier | null;
  country?: string;
  serviceType?: VendorServiceType | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  nextReviewDate?: string | null;
  vendorStatus?: VendorStatus;
  certifications?: VendorCertification[];
  vendorFunctions?: VendorFunction[];
  exitStrategyDoc?: string | null;
}

// Vendor Profile Types (DORA Article 28)
export type VendorTier = 'critical' | 'important' | 'standard';
export type VendorServiceType = 'cloud' | 'software' | 'data' | 'network' | 'other';
export type VendorStatus = 'active' | 'under-review' | 'exited';
export type CertificationType = 'ISO27001' | 'SOC2' | 'CSA-STAR' | 'ISO22301';
export type VendorFunction =
  | 'payment_processing'
  | 'settlement_clearing'
  | 'core_banking'
  | 'risk_management'
  | 'regulatory_reporting'
  | 'fraud_detection'
  | 'data_storage'
  | 'network_infrastructure'
  | 'identity_access_management'
  | 'business_continuity';

export interface VendorCertification {
  type: CertificationType;
  validUntil: string;
  status: 'valid' | 'expiring-soon' | 'expired';
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
  inviteToken?: string;
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

