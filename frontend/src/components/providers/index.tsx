'use client';

import { ThemeProvider } from './theme-provider';
import { QueryProvider } from './query-provider';
import { AuthProvider } from './auth-provider';
import { SocketProvider } from './socket-provider';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
