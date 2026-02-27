'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Building2, UserCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';
import { organizationsApi } from '@/lib/api/organizations';
import { getErrorMessage } from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  org_admin: 'Admin',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isInitialized, fetchUser } = useAuthStore();

  const token = searchParams.get('token');

  const [inviteInfo, setInviteInfo] = useState<{
    organizationName: string;
    inviterName: string | null;
    role: string;
    email: string;
  } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setFetchError('No invite token provided.');
      setIsLoading(false);
      return;
    }

    organizationsApi
      .getInviteInfo(token)
      .then((res) => {
        if (res.status === 'success' && res.data) {
          setInviteInfo(res.data);
        } else {
          setFetchError('Invalid or expired invite link.');
        }
      })
      .catch(() => {
        setFetchError('Invalid or expired invite link.');
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      await organizationsApi.acceptInvite(token);
      await fetchUser();
      toast.success(`Welcome to ${inviteInfo?.organizationName}!`);
      router.push('/assessments');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setIsAccepting(false);
    }
  };

  const handleRegisterRedirect = () => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (inviteInfo?.email) params.set('email', encodeURIComponent(inviteInfo.email));
    router.push(`/register?${params.toString()}`);
  };

  if (isLoading || !isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading invite...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-4 text-center py-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Invite not found</h2>
        <p className="text-muted-foreground text-sm">{fetchError}</p>
        <Button variant="outline" onClick={() => router.push('/login')}>
          Go to login
        </Button>
      </div>
    );
  }

  if (!inviteInfo) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Building2 className="h-10 w-10 mx-auto text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">
          You&apos;re invited to join
        </h2>
        <p className="text-lg font-medium">{inviteInfo.organizationName}</p>
        {inviteInfo.inviterName && (
          <p className="text-sm text-muted-foreground">
            Invited by <span className="font-medium">{inviteInfo.inviterName}</span>
          </p>
        )}
        <div className="flex justify-center">
          <Badge variant="secondary" className="text-sm">
            Role: {ROLE_LABEL[inviteInfo.role] || inviteInfo.role}
          </Badge>
        </div>
      </div>

      {isAuthenticated && user ? (
        // Authenticated — show Accept button
        <div className="space-y-4">
          <div className="bg-muted rounded-md p-3 text-sm text-center text-muted-foreground">
            You are signed in as <span className="font-medium">{user.email}</span>
          </div>

          {user.organizationId ? (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3 text-center">
              You already belong to an organization. Contact support if you need to switch.
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleAccept}
              disabled={isAccepting}
            >
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Accept &amp; join {inviteInfo.organizationName}
                </>
              )}
            </Button>
          )}
        </div>
      ) : (
        // Not authenticated — redirect to register with token pre-filled
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Create an account to join your team on Retrieva.
          </p>
          <Button className="w-full" onClick={handleRegisterRedirect}>
            Create account &amp; join
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <button
              className="text-primary hover:underline font-medium"
              onClick={() => router.push(`/login?redirect=/join?token=${token}`)}
            >
              Sign in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageContent />
    </Suspense>
  );
}
