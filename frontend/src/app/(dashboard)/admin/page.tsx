'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Server,
  Database,
  Users,
  Activity,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';
import { adminApi } from '@/lib/api/admin';

interface CacheStatsData {
  hits?: number;
  misses?: number;
  total?: number;
  hitRate?: string;
  hitRateNumeric?: number;
}

function StatusBadge({ status }: { status: string }) {
  const isHealthy = status === 'connected' || status === 'ok' || status === 'healthy';
  return (
    <Badge variant={isHealthy ? 'default' : 'destructive'} className="gap-1">
      {isHealthy ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {status}
    </Badge>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // Redirect non-admins
  if (user && user.role !== 'admin') {
    router.push('/chat');
    return null;
  }

  // Fetch system health
  const { data: health, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const response = await adminApi.getSystemHealth();
      return response.data;
    },
    refetchInterval: 30000,
  });

  // Fetch memory dashboard
  const { data: memoryStats, isLoading: isLoadingMemory, refetch: refetchMemory } = useQuery({
    queryKey: ['admin-memory'],
    queryFn: async () => {
      const response = await adminApi.getMemoryDashboard();
      return response.data;
    },
  });

  // Fetch cache stats
  const { data: cacheStats, isLoading: isLoadingCache, refetch: refetchCache } = useQuery({
    queryKey: ['admin-cache'],
    queryFn: async () => {
      const response = await adminApi.getCacheStats();
      return response.data as CacheStatsData;
    },
  });

  // Fetch presence stats
  const { data: presenceStats, isLoading: isLoadingPresence } = useQuery({
    queryKey: ['admin-presence'],
    queryFn: async () => {
      const response = await adminApi.getPresenceStats();
      return response.data;
    },
    refetchInterval: 10000,
  });

  // Fetch decay stats
  const { data: decayStats, isLoading: isLoadingDecay } = useQuery({
    queryKey: ['admin-decay'],
    queryFn: async () => {
      const response = await adminApi.getDecayStats();
      return response.data;
    },
  });

  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: adminApi.clearAllCaches,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cache'] });
      queryClient.invalidateQueries({ queryKey: ['admin-memory'] });
    },
  });

  // Trigger decay mutation
  const triggerDecayMutation = useMutation({
    mutationFn: adminApi.triggerDecay,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-decay'] });
    },
  });

  const handleRefreshAll = () => {
    refetchHealth();
    refetchMemory();
    refetchCache();
  };

  const handleClearCaches = () => {
    if (window.confirm('Are you sure you want to clear all caches? This may temporarily slow down responses.')) {
      clearCacheMutation.mutate();
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System monitoring and management
          </p>
        </div>
        <Button variant="outline" onClick={handleRefreshAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh All
        </Button>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            System Health
          </CardTitle>
          <CardDescription>Current status of all services</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHealth ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : health ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">MongoDB</p>
                <StatusBadge status={health.services?.mongodb || 'unknown'} />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Redis</p>
                <StatusBadge status={health.services?.redis || 'unknown'} />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Qdrant</p>
                <StatusBadge status={health.services?.qdrant || 'unknown'} />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ollama</p>
                <StatusBadge status={health.services?.ollama || 'unknown'} />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="font-medium">{formatUptime(health.uptime || 0)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Memory Usage</p>
                <p className="font-medium">
                  {health.memory ? `${health.memory.percentage?.toFixed(1)}%` : 'N/A'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Unable to fetch system health</p>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Database Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMemory ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : memoryStats?.database ? (
              <div className="space-y-1 text-sm">
                <p>Conversations: <span className="font-medium">{memoryStats.database.conversations ?? 0}</span></p>
                <p>Messages: <span className="font-medium">{memoryStats.database.messages ?? 0}</span></p>
                <p>Users: <span className="font-medium">{memoryStats.database.users ?? 0}</span></p>
                <p>Workspaces: <span className="font-medium">{memoryStats.database.workspaces ?? 0}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Cache Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Cache
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCache ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cacheStats ? (
              <div className="space-y-1 text-sm">
                <p>Hits: <span className="font-medium">{cacheStats.hits ?? 0}</span></p>
                <p>Misses: <span className="font-medium">{cacheStats.misses ?? 0}</span></p>
                <p>Hit Rate: <span className="font-medium">{cacheStats.hitRate ?? '0%'}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Online Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Online Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPresence ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : presenceStats ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{presenceStats.totalOnline || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {presenceStats.activeConnections || 0} connections
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Memory Decay */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Memory Decay
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingDecay ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : decayStats ? (
              <div className="space-y-1 text-sm">
                <p>Last Run: <span className="font-medium">{decayStats.lastRun ? new Date(decayStats.lastRun).toLocaleDateString() : 'Never'}</span></p>
                <p>Processed: <span className="font-medium">{decayStats.documentsProcessed || 0}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Admin Actions
          </CardTitle>
          <CardDescription>System maintenance operations (use with caution)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button
            variant="destructive"
            disabled={clearCacheMutation.isPending}
            onClick={handleClearCaches}
          >
            {clearCacheMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Clear All Caches
          </Button>

          <Button
            variant="outline"
            onClick={() => triggerDecayMutation.mutate()}
            disabled={triggerDecayMutation.isPending}
          >
            {triggerDecayMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Clock className="h-4 w-4 mr-2" />
            )}
            Trigger Memory Decay
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
