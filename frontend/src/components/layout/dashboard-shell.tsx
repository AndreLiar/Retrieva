'use client';

import { useEffect, lazy, Suspense } from 'react';

import { Header } from '@/components/layout/header';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { ModalOutlet } from '@/components/layout/modal-outlet';
import { Sidebar } from '@/components/layout/sidebar';

const WelcomeScreen = lazy(() =>
  import('@/components/onboarding/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })),
);
import { useUIStore } from '@/state/ui-store';
import type { User } from '@/types';

interface DashboardShellProps {
  children: React.ReactNode;
  user: User;
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const setIsMobile = useUIStore((state) => state.setIsMobile);
  const isMobile = useUIStore((state) => state.isMobile);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile]);

  return (
    <div className="flex h-screen overflow-hidden isolate">
      {!isMobile && <Sidebar />}
      <MobileSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <ModalOutlet />

      {user.organizationId && user.onboardingCompleted === false && (
        <Suspense fallback={null}>
          <WelcomeScreen />
        </Suspense>
      )}
    </div>
  );
}
