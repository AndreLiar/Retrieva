'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
}

interface UseSocketOptions {
  autoConnect?: boolean;
}

// Socket event types
export interface SyncStatusEvent {
  notionWorkspaceId: string;
  status: 'syncing' | 'completed' | 'error' | 'idle';
  pagesProcessed?: number;
  totalPages?: number;
  error?: string;
}

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceEvent {
  workspaceId: string;
  type: 'member_joined' | 'member_left' | 'member_role_changed' | 'workspace_updated';
  data?: Record<string, unknown>;
}

/**
 * Hook for managing Socket.io connection and events
 */
export function useSocket(options: UseSocketOptions = {}) {
  const { autoConnect = true } = options;
  const [state, setState] = useState<SocketState>({
    socket: null,
    isConnected: false,
    error: null,
  });

  const socketRef = useRef<Socket | null>(null);
  // ISSUE #45 FIX: Track joined rooms to ensure proper cleanup
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeWorkspace = useActiveWorkspace();

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect || !isAuthenticated) {
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || '';

    // Create socket connection
    const socket = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));

      // Join workspace room if active
      if (activeWorkspace?.id) {
        socket.emit('join-workspace', activeWorkspace.id);
        joinedRoomsRef.current.add(activeWorkspace.id);
      }
    });

    socket.on('disconnect', (reason) => {
      setState((prev) => ({ ...prev, isConnected: false }));
      // ISSUE #45 FIX: Clear joined rooms on disconnect since server-side rooms are cleared
      joinedRoomsRef.current.clear();
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      setState((prev) => ({ ...prev, error: error.message, isConnected: false }));
      console.error('Socket connection error:', error);
    });

    setState((prev) => ({ ...prev, socket }));

    // ISSUE #45 FIX: Proper cleanup on unmount
    // Capture ref values for cleanup
    const currentJoinedRooms = joinedRoomsRef.current;
    return () => {
      // Leave all joined rooms before disconnecting
      const currentSocket = socketRef.current;
      if (currentSocket?.connected) {
        currentJoinedRooms.forEach((roomId) => {
          currentSocket.emit('leave-workspace', roomId);
        });
      }
      currentJoinedRooms.clear();

      currentSocket?.disconnect();
      socketRef.current = null;
      setState({ socket: null, isConnected: false, error: null });
    };
    // activeWorkspace.id intentionally excluded — handled in separate effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, isAuthenticated]);

  // ISSUE #45 FIX: Handle workspace changes - join/leave rooms with proper cleanup
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !state.isConnected) return;

    const workspaceId = activeWorkspace?.id;

    if (workspaceId && !joinedRoomsRef.current.has(workspaceId)) {
      // Join new workspace room
      socket.emit('join-workspace', workspaceId);
      joinedRoomsRef.current.add(workspaceId);
    }

    // Capture values for cleanup
    const currentWorkspaceId = workspaceId;
    const currentJoinedRooms = joinedRoomsRef.current;

    return () => {
      // Only leave if socket is still connected and we have the room
      if (currentWorkspaceId && socketRef.current?.connected && currentJoinedRooms.has(currentWorkspaceId)) {
        socketRef.current.emit('leave-workspace', currentWorkspaceId);
        currentJoinedRooms.delete(currentWorkspaceId);
      }
    };
  }, [activeWorkspace?.id, state.isConnected]);

  // Subscribe to an event
  const on = useCallback(
    <T = unknown>(event: string, callback: (data: T) => void) => {
      const socket = socketRef.current;
      if (!socket) return () => {};

      socket.on(event, callback);
      return () => {
        socket.off(event, callback);
      };
    },
    []
  );

  // Emit an event
  const emit = useCallback(
    <T = unknown>(event: string, data?: T) => {
      const socket = socketRef.current;
      if (!socket || !state.isConnected) {
        console.warn('Socket not connected, cannot emit:', event);
        return;
      }
      socket.emit(event, data);
    },
    [state.isConnected]
  );

  // Disconnect manually
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  // Reconnect manually
  const reconnect = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  return {
    ...state,
    on,
    emit,
    disconnect,
    reconnect,
  };
}

/**
 * Hook specifically for sync status updates
 */
export function useSyncStatusUpdates(
  notionWorkspaceId: string,
  onUpdate: (status: SyncStatusEvent) => void
) {
  const { on, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected || !notionWorkspaceId) return;

    const unsubscribe = on<SyncStatusEvent>('sync:status', (data) => {
      if (data.notionWorkspaceId === notionWorkspaceId) {
        onUpdate(data);
      }
    });

    return unsubscribe;
  }, [isConnected, notionWorkspaceId, onUpdate, on]);
}

/**
 * Hook for real-time notifications
 */
export function useNotificationUpdates(onNotification: (notification: NotificationEvent) => void) {
  const { on, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on<NotificationEvent>('notification:new', onNotification);
    return unsubscribe;
  }, [isConnected, onNotification, on]);
}

/**
 * Hook for workspace membership updates
 */
export function useWorkspaceUpdates(onUpdate: (event: WorkspaceEvent) => void) {
  const { on, isConnected } = useSocket();
  const activeWorkspace = useActiveWorkspace();

  useEffect(() => {
    if (!isConnected || !activeWorkspace?.id) return;

    const unsubscribe = on<WorkspaceEvent>('workspace:update', (data) => {
      if (data.workspaceId === activeWorkspace.id) {
        onUpdate(data);
      }
    });

    return unsubscribe;
  }, [isConnected, activeWorkspace?.id, onUpdate, on]);
}
