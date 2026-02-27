import apiClient from './client';
import type {
  ApiResponse,
  Workspace,
  WorkspaceWithMembership,
  WorkspaceMembership,
  WorkspaceRole,
  WorkspacePermissions,
  VendorTier,
  VendorServiceType,
  VendorStatus,
  CertificationType,
} from '@/types';

export interface CreateWorkspaceData {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceData {
  name?: string;
  description?: string;
  vendorTier?: VendorTier | null;
  country?: string;
  serviceType?: VendorServiceType | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  nextReviewDate?: string | null;
  vendorStatus?: VendorStatus;
  certifications?: Array<{ type: CertificationType; validUntil: string }>;
  exitStrategyDoc?: string | null;
}

export interface InviteMemberData {
  email: string;
  role: 'member' | 'viewer';
  permissions?: Partial<WorkspacePermissions>;
}

export interface UpdateMemberData {
  role?: WorkspaceRole;
  permissions?: Partial<WorkspacePermissions>;
}

export const workspacesApi = {
  /**
   * Get all workspaces for the current user
   */
  list: async () => {
    const response = await apiClient.get<
      ApiResponse<{ workspaces: WorkspaceWithMembership[] }>
    >('/workspaces/my-workspaces');
    return response.data;
  },

  /**
   * Get a single workspace
   */
  get: async (id: string) => {
    const response = await apiClient.get<
      ApiResponse<{ workspace: WorkspaceWithMembership }>
    >(`/workspaces/${id}`);
    return response.data;
  },

  /**
   * Create a new workspace
   */
  create: async (data: CreateWorkspaceData) => {
    const response = await apiClient.post<
      ApiResponse<{ workspace: Workspace }>
    >('/workspaces', data);
    return response.data;
  },

  /**
   * Update a workspace
   */
  update: async (id: string, data: UpdateWorkspaceData) => {
    const response = await apiClient.patch<
      ApiResponse<{ workspace: Workspace }>
    >(`/workspaces/${id}`, data);
    return response.data;
  },

  /**
   * Delete a workspace
   */
  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse>(`/workspaces/${id}`);
    return response.data;
  },

  // Member management
  members: {
    /**
     * Get all members of a workspace
     */
    list: async (workspaceId: string) => {
      const response = await apiClient.get<
        ApiResponse<{ members: (WorkspaceMembership & { user: { email: string; name: string } })[] }>
      >(`/workspaces/${workspaceId}/members`);
      return response.data;
    },

    /**
     * Invite a member to a workspace
     */
    invite: async (workspaceId: string, data: InviteMemberData) => {
      const response = await apiClient.post<
        ApiResponse<{ membership: WorkspaceMembership }>
      >(`/workspaces/${workspaceId}/invite`, data);
      return response.data;
    },

    /**
     * Update a member's role or permissions
     */
    update: async (
      workspaceId: string,
      memberId: string,
      data: UpdateMemberData
    ) => {
      const response = await apiClient.patch<
        ApiResponse<{ membership: WorkspaceMembership }>
      >(`/workspaces/${workspaceId}/members/${memberId}`, data);
      return response.data;
    },

    /**
     * Remove a member from a workspace
     */
    remove: async (workspaceId: string, memberId: string) => {
      const response = await apiClient.delete<ApiResponse>(
        `/workspaces/${workspaceId}/members/${memberId}`
      );
      return response.data;
    },
  },

  /**
   * Download a DORA Article 28(3) Register of Information XLSX workbook
   * covering all workspaces accessible by the current user.
   */
  exportRoi: async () => {
    const response = await apiClient.get('/workspaces/roi-export', {
      responseType: 'blob',
      timeout: 60_000,
    });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `DORA_Register_of_Information_${dateStr}.xlsx`;
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
