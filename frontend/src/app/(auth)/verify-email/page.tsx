'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { authApi, getErrorMessage } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setError('Invalid verification link. Please request a new verification email.');
        return;
      }

      try {
        await authApi.verifyEmail(token);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(getErrorMessage(err));
      }
    };

    verifyEmail();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Verifying your email...</h2>
          <p className="text-sm text-muted-foreground">Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 bg-success-muted rounded-full flex items-center justify-center">
          <Check className="h-6 w-6 text-success" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Email verified!</h2>
          <p className="text-sm text-muted-foreground">
            Your email has been successfully verified. You can now access all features.
          </p>
        </div>
        <Link href="/">
          <Button className="w-full">Go to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
        <X className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Verification failed</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      <div className="space-y-3">
        <Link href="/login">
          <Button className="w-full">Go to Login</Button>
        </Link>
        <p className="text-xs text-muted-foreground">
          Need a new verification email? Log in and request one from your account settings.
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Loading...</h2>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
