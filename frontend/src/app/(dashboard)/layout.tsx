import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getServerSessionUser } from '@/shared/server/auth-session';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerSessionUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.organizationId) {
    redirect('/onboarding');
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
