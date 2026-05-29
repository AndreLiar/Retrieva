'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Loader2, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { authApi, getErrorMessage } from '@/lib/api';

function VerifyEmailContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setError(t('auth.verifyEmail.invalidLink'));
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
  }, [token, t]);

  if (status === 'loading') {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('auth.verifyEmail.verifyingTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('auth.verifyEmail.verifyingSubtitle')}
          </p>
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
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('auth.verifyEmail.successTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('auth.verifyEmail.successSubtitle')}</p>
        </div>
        <Link href="/">
          <Button className="w-full">{t('auth.verifyEmail.goToDashboard')}</Button>
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
        <h2 className="text-2xl font-semibold tracking-tight">
          {t('auth.verifyEmail.failedTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      <div className="space-y-3">
        <Link href="/login">
          <Button className="w-full">{t('auth.verifyEmail.goToLogin')}</Button>
        </Link>
        <p className="text-xs text-muted-foreground">{t('auth.verifyEmail.needNew')}</p>
      </div>
    </div>
  );
}

function VerifyEmailFallback() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t('auth.verifyEmail.loading')}</h2>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
