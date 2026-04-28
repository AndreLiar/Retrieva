import { redirect } from 'next/navigation';

import { LandingPageContent } from '@/components/marketing/landing-page-content';
import { APP_HOME_ROUTE } from '@/lib/navigation';
import { getServerSessionUser } from '@/shared/server/auth-session';

export default async function LandingPage() {
  const user = await getServerSessionUser();

  if (user) {
    redirect(APP_HOME_ROUTE);
  }

  return <LandingPageContent />;
}
