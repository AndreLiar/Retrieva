import apiClient from '@/shared/api/client';
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
  VendorFunction,
  CertificationType,
  WorkspaceApiResponse,
} from '@/types';

export interface CreateWorkspaceData {
  name: string;
  description?: string;
  vendorTier?: VendorTier | null;
  serviceType?: VendorServiceType | null;
  country?: string;
  contractStart?: string | null;
  contractEnd?: string | null;
  vendorFunctions?: VendorFunction[];
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
  vendorFunctions?: VendorFunction[];
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

export interface ComplianceScore {
  score: number;
  trend: number;
  status: 'green' | 'amber' | 'red';
  assessmentCount: number;
}

function normalizeWorkspace(workspace: WorkspaceApiResponse): WorkspaceWithMembership {
  const workspaceId = workspace.id || workspace._id || '';
  const workspaceName = workspace.workspaceName || workspace.name || '';
  const role = workspace.myRole || workspace.role || 'viewer';
  const permissions = workspace.permissions || {
    canQuery: true,
    canViewSources: true,
    canInvite: false,
  };

  return {
    id: workspaceId,
    workspaceName,
    workspaceIcon: workspace.workspaceIcon,
    syncStatus: workspace.syncStatus || 'idle',
    stats: workspace.stats,
    myRole: role,
    permissions,
    joinedAt: workspace.joinedAt || new Date().toISOString(),
    description: workspace.description,
    name: workspaceName,
    membership: {
      role,
      permissions,
      status: 'active',
    },
    vendorTier: workspace.vendorTier,
    country: workspace.country,
    serviceType: workspace.serviceType,
    contractStart: workspace.contractStart,
    contractEnd: workspace.contractEnd,
    nextReviewDate: workspace.nextReviewDate,
    vendorStatus: workspace.vendorStatus,
    certifications: workspace.certifications,
    vendorFunctions: workspace.vendorFunctions,
    exitStrategyDoc: workspace.exitStrategyDoc,
  };
}

export const workspacesApi = {
  /**
   * Get all workspaces for the current user
   */
  list: async () => {
    const response = await apiClient.get<
      ApiResponse<{ workspaces: WorkspaceApiResponse[] }>
    >('/workspaces/my-workspaces');
    return {
      ...response.data,
      data: response.data.data
        ? {
            workspaces: response.data.data.workspaces.map(normalizeWorkspace),
          }
        : undefined,
    };
  },

  /**
   * Get a single workspace
   */
  get: async (id: string) => {
    const response = await apiClient.get<
      ApiResponse<{ workspace: WorkspaceApiResponse }>
    >(`/workspaces/${id}`);
    return {
      ...response.data,
      data: response.data.data
        ? {
            workspace: normalizeWorkspace(response.data.data.workspace),
          }
        : undefined,
    };
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

  getComplianceScore: async (workspaceId: string) => {
    const response = await apiClient.get<
      ApiResponse<{ score: ComplianceScore | null }>
    >(`/workspaces/${workspaceId}/compliance-score`);
    return response.data.data?.score ?? null;
  },
};
