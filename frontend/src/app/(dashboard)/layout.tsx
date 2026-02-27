'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { ModalOutlet } from '@/components/layout/modal-outlet';
import { useUIStore } from '@/lib/stores/ui-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const setIsMobile = useUIStore((state) => state.setIsMobile);
  const isMobile = useUIStore((state) => state.isMobile);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile]);

  // Redirect to login when session is verified as invalid
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isInitialized, isAuthenticated, router]);

  // Redirect to onboarding if user has no org
  useEffect(() => {
    if (isInitialized && isAuthenticated && !organizationId) {
      router.replace('/onboarding');
    }
  }, [isInitialized, isAuthenticated, organizationId, router]);

  // Fetch workspaces when authenticated
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      fetchWorkspaces();
    }
  }, [isAuthenticated, isInitialized, fetchWorkspaces]);

  // Show loading state while initializing or redirecting unauthenticated users
  if (!isInitialized || isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex w-64 flex-col border-r bg-sidebar">
          <div className="h-14 border-b px-4 flex items-center">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="p-3">
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex-1 p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b px-4 flex items-center justify-end gap-2">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <div className="flex-1 p-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden isolate">
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile Sidebar */}
      <MobileSidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* Global Modals */}
      <ModalOutlet />
    </div>
  );
}
