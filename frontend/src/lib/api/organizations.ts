import apiClient from './client';
import type { ApiResponse } from '@/types';

export interface OrganizationData {
  id: string;
  name: string;
  industry: string;
  country: string;
}

export interface OrgMember {
  id: string;
  email: string;
  role: 'org_admin' | 'analyst' | 'viewer';
  status: 'pending' | 'active' | 'revoked';
  joinedAt?: string;
  user?: { id: string; name: string; email: string } | null;
}

export interface InviteInfoResponse {
  organizationName: string;
  inviterName: string | null;
  role: string;
  email: string;
}

export const organizationsApi = {
  create: async (data: { name: string; industry: string; country: string }) => {
    const response = await apiClient.post<ApiResponse<{ organization: OrganizationData }>>(
      '/organizations',
      data
    );
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get<
      ApiResponse<{ organization: OrganizationData | null; role: string | null }>
    >('/organizations/me');
    return response.data;
  },

  getInviteInfo: async (token: string) => {
    const response = await apiClient.get<ApiResponse<InviteInfoResponse>>(
      `/organizations/invite-info?token=${encodeURIComponent(token)}`
    );
    return response.data;
  },

  invite: async (data: { email: string; role: string }) => {
    const response = await apiClient.post<ApiResponse<{ member: OrgMember }>>(
      '/organizations/invite',
      data
    );
    return response.data;
  },

  acceptInvite: async (token: string) => {
    const response = await apiClient.post<ApiResponse>('/organizations/accept-invite', {
      token,
    });
    return response.data;
  },

  getMembers: async () => {
    const response = await apiClient.get<ApiResponse<{ members: OrgMember[] }>>(
      '/organizations/members'
    );
    return response.data;
  },

  removeMember: async (memberId: string) => {
    const response = await apiClient.delete<ApiResponse>(
      `/organizations/members/${memberId}`
    );
    return response.data;
  },
};
