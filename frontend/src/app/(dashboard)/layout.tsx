import { DashboardShell } from '@/components/layout/dashboard-shell';
import { getServerSessionUser } from '@/shared/server/auth-session';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerSessionUser();

  return (
    <DashboardShell initialUser={user ?? undefined}>{children}</DashboardShell>
  );
}
