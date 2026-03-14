'use client';

import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { UserNav } from './user-nav';
import { useUIStore } from '@/lib/stores/ui-store';

export function Header() {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isMobile = useUIStore((state) => state.isMobile);

  return (
    <header className="sticky top-0 z-40 flex h-13 items-center gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-5 sm:px-6">
      {isMobile && (
        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}
