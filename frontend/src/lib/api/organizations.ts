import apiClient from './client';
import type { ApiResponse, Organization, OrgMember, OrgRole, LinkedWorkspace } from '@/types';

export interface CreateOrgDto {
  name: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateOrgDto {
  name?: string;
  description?: string;
  logoUrl?: string;
  settings?: Partial<Organization['settings']>;
}

export const organizationsApi = {
  list: async () => {
    const response = await apiClient.get<
      ApiResponse<{ organizations: { org: Organization; role: OrgRole }[] }>
    >('/organizations');
    return response.data;
  },

  create: async (data: CreateOrgDto) => {
    const response = await apiClient.post<ApiResponse<{ organization: Organization }>>(
      '/organizations',
      data
    );
    return response.data;
  },

  get: async (id: string) => {
    const response = await apiClient.get<ApiResponse<{ organization: Organization }>>(
      `/organizations/${id}`
    );
    return response.data;
  },

  update: async (id: string, data: UpdateOrgDto) => {
    const response = await apiClient.patch<ApiResponse<{ organization: Organization }>>(
      `/organizations/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse>(`/organizations/${id}`);
    return response.data;
  },

  getMembers: async (id: string) => {
    const response = await apiClient.get<ApiResponse<{ members: OrgMember[] }>>(
      `/organizations/${id}/members`
    );
    return response.data;
  },

  invite: async (id: string, email: string, role: OrgRole) => {
    const response = await apiClient.post<ApiResponse<{ membership: OrgMember }>>(
      `/organizations/${id}/invite`,
      { email, role }
    );
    return response.data;
  },

  updateMember: async (id: string, memberId: string, role: OrgRole) => {
    const response = await apiClient.patch<ApiResponse<{ member: OrgMember }>>(
      `/organizations/${id}/members/${memberId}`,
      { role }
    );
    return response.data;
  },

  removeMember: async (id: string, memberId: string) => {
    const response = await apiClient.delete<ApiResponse>(
      `/organizations/${id}/members/${memberId}`
    );
    return response.data;
  },

  getWorkspaces: async (id: string) => {
    const response = await apiClient.get<ApiResponse<{ workspaces: LinkedWorkspace[] }>>(
      `/organizations/${id}/workspaces`
    );
    return response.data;
  },

  linkWorkspace: async (id: string, workspaceId: string) => {
    const response = await apiClient.post<ApiResponse>(`/organizations/${id}/workspaces`, {
      workspaceId,
    });
    return response.data;
  },

  unlinkWorkspace: async (id: string, wsId: string) => {
    const response = await apiClient.delete<ApiResponse>(
      `/organizations/${id}/workspaces/${wsId}`
    );
    return response.data;
  },
};
