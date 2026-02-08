import apiClient from './client';
import type { ApiResponse } from '@/types';

interface SystemHealth {
  status: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  services: {
    mongodb: string;
    redis: string;
    qdrant: string;
    ollama: string;
  };
}

interface MemoryStats {
  database: {
    conversations: number;
    messages: number;
    users: number;
    workspaces: number;
  };
  redis: {
    used_memory: string;
    connected_clients: number;
    keys: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

interface PresenceStats {
  totalOnline: number;
  byWorkspace: Record<string, number>;
  activeConnections: number;
}

interface DecayStats {
  lastRun: string;
  documentsProcessed: number;
  nextScheduled: string;
}

interface UserStats {
  total: number;
  active: number;
  admins: number;
  recentSignups: number;
}

export const adminApi = {
  // System health
  getSystemHealth: async (): Promise<ApiResponse<SystemHealth>> => {
    const response = await apiClient.get('/health/detailed');
    return response.data;
  },

  // Memory stats
  getMemoryDashboard: async (): Promise<ApiResponse<MemoryStats>> => {
    const response = await apiClient.get('/memory/dashboard');
    return response.data;
  },

  getDatabaseStats: async (): Promise<ApiResponse> => {
    const response = await apiClient.get('/memory/database');
    return response.data;
  },

  getRedisStats: async (): Promise<ApiResponse> => {
    const response = await apiClient.get('/memory/redis');
    return response.data;
  },

  getCacheStats: async (): Promise<ApiResponse> => {
    const response = await apiClient.get('/memory/cache');
    return response.data;
  },

  // Decay management
  getDecayStats: async (): Promise<ApiResponse<DecayStats>> => {
    const response = await apiClient.get('/memory/decay/stats');
    return response.data;
  },

  triggerDecay: async (): Promise<ApiResponse> => {
    const response = await apiClient.post('/memory/decay/trigger');
    return response.data;
  },

  // Cache management
  clearAllCaches: async (): Promise<ApiResponse> => {
    const response = await apiClient.delete('/memory/caches');
    return response.data;
  },

  resetMetrics: async (): Promise<ApiResponse> => {
    const response = await apiClient.delete('/memory/metrics');
    return response.data;
  },

  // Presence stats
  getPresenceStats: async (): Promise<ApiResponse<PresenceStats>> => {
    const response = await apiClient.get('/presence/stats');
    return response.data;
  },

  // RAG stats
  getRoutingStats: async (): Promise<ApiResponse> => {
    const response = await apiClient.get('/rag/stats');
    return response.data;
  },

  // User stats (you may need to create this endpoint)
  getUserStats: async (): Promise<ApiResponse<UserStats>> => {
    // This endpoint may not exist yet
    try {
      const response = await apiClient.get('/admin/users/stats');
      return response.data;
    } catch {
      // Return mock data if endpoint doesn't exist
      return {
        status: 'success',
        message: 'User stats retrieved (mock)',
        data: {
          total: 0,
          active: 0,
          admins: 0,
          recentSignups: 0,
        },
      };
    }
  },

  // Audit logs
  getAuditLogs: async (params?: { hours?: number; limit?: number }): Promise<ApiResponse> => {
    const response = await apiClient.get('/guardrails/audit', { params });
    return response.data;
  },

  getAuditSummary: async (params?: { hours?: number }): Promise<ApiResponse> => {
    const response = await apiClient.get('/guardrails/audit/summary', { params });
    return response.data;
  },
};
