'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldOff, Copy } from 'lucide-react';
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
      toast.success('Two-factor authentication enabled');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disableMfa(disablePassword, disableCode.trim()),
    onSuccess: () => {
      if (user) setUser({ ...user, mfaEnabled: false });
      setDisablePassword('');
      setDisableCode('');
      toast.success('Two-factor authentication disabled');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const copyRecoveryCodes = () => {
    if (recoveryCodes) {
      navigator.clipboard?.writeText(recoveryCodes.join('\n'));
      toast.success('Recovery codes copied');
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
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? 'Your account is protected with an authenticator app.'
            : 'Add a second step at sign-in using an authenticator app (TOTP).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* One-time recovery codes shown right after enabling */}
        {recoveryCodes && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3 dark:bg-amber-950/30">
            <p className="text-sm font-medium">
              Save these recovery codes now — they are shown only once. Each can be used once
              if you lose your device.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((rc) => (
                <span key={rc}>{rc}</span>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyRecoveryCodes}>
              <Copy className="mr-2 h-4 w-4" />
              Copy codes
            </Button>
          </div>
        )}

        {/* Disabled → enrollment */}
        {!enabled && !setup && (
          <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {setupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Set up two-factor authentication
          </Button>
        )}

        {!enabled && setup && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">1. Add this account to your authenticator app</p>
              <p className="text-xs text-muted-foreground">
                Scan the otpauth URL as a QR code, or enter the secret manually:
              </p>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {setup.secret}
              </code>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {setup.otpauthUrl}
              </code>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">2. Enter the 6-digit code to confirm</p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
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
                  Enable
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSetup(null);
                    setCode('');
                  }}
                  disabled={enableMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Enabled → disable form */}
        {enabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              To disable, confirm your password and a current code.
            </p>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              disabled={disableMutation.isPending}
            />
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code or recovery code"
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
              Disable two-factor authentication
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
