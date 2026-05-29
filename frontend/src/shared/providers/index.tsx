'use client';

import { ThemeProvider } from './theme-provider';
import { QueryProvider } from './query-provider';
import { AuthProvider } from './auth-provider';
import { I18nProvider } from '@/shared/i18n/i18n-provider';
import { Toaster } from '@/shared/ui/sonner';
import type { User } from '@/types';

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: User | null;
  authResolved?: boolean;
}

export function Providers({
  children,
  initialUser,
  authResolved = false,
}: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider>
        <QueryProvider>
          <AuthProvider initialUser={initialUser} authResolved={authResolved}>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
