'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { authApi, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';
import type { MfaSetupResponse } from '@/types';

/**
 * Two-factor authentication (TOTP) enrollment + teardown.
 *
 * Flow: Set up → scan/enter the secret in an authenticator app → confirm a code
 * → MFA enabled, recovery codes shown once. Disable requires password + a code.
 */
export function MfaSection() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const enabled = !!user?.mfaEnabled;

  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const setupMutation = useMutation({
    mutationFn: () => authApi.setupMfa(),
    onSuccess: (res) => {
      if (res.data) setSetup(res.data);
      setRecoveryCodes(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const enableMutation = useMutation({
    mutationFn: () => authApi.enableMfa(code.trim()),
    onSuccess: (res) => {
      setRecoveryCodes(res.data?.recoveryCodes ?? []);
      setSetup(null);
      setCode('');
      if (user) setUser({ ...user, mfaEnabled: true });
      toast.success(t('settings.mfa.toastEnabled'));
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disableMfa(disablePassword, disableCode.trim()),
    onSuccess: () => {
      if (user) setUser({ ...user, mfaEnabled: false });
      setDisablePassword('');
      setDisableCode('');
      toast.success(t('settings.mfa.toastDisabled'));
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const copyRecoveryCodes = () => {
    if (recoveryCodes) {
      navigator.clipboard?.writeText(recoveryCodes.join('\n'));
      toast.success(t('settings.mfa.toastCopied'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
          )}
          {t('settings.mfa.title')}
        </CardTitle>
        <CardDescription>
          {enabled
            ? t('settings.mfa.descEnabled')
            : t('settings.mfa.descDisabled')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* One-time recovery codes shown right after enabling */}
        {recoveryCodes && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3 dark:bg-amber-950/30">
            <p className="text-sm font-medium">
              {t('settings.mfa.recoveryNote')}
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((rc) => (
                <span key={rc}>{rc}</span>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyRecoveryCodes}>
              <Copy className="mr-2 h-4 w-4" />
              {t('settings.mfa.copyCodes')}
            </Button>
          </div>
        )}

        {/* Disabled → enrollment */}
        {!enabled && !setup && (
          <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {setupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settings.mfa.setup')}
          </Button>
        )}

        {!enabled && setup && (
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('settings.mfa.step1')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.mfa.step1Desc')}
              </p>
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <QRCodeSVG value={setup.otpauthUrl} size={180} />
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.mfa.manualEntry')}</p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs select-all">
                {setup.secret}
              </code>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('settings.mfa.step2')}</p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('settings.mfa.codePlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={enableMutation.isPending}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => enableMutation.mutate()}
                  disabled={enableMutation.isPending || code.trim().length < 6}
                >
                  {enableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('settings.mfa.enable')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSetup(null);
                    setCode('');
                  }}
                  disabled={enableMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Enabled → disable form */}
        {enabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('settings.mfa.disablePrompt')}
            </p>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t('settings.mfa.currentPasswordPlaceholder')}
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              disabled={disableMutation.isPending}
            />
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('settings.mfa.disableCodePlaceholder')}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              disabled={disableMutation.isPending}
            />
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={
                disableMutation.isPending ||
                disablePassword.length < 1 ||
                disableCode.trim().length < 6
              }
            >
              {disableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.mfa.disable')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
