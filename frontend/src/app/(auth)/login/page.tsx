'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Loader2, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api';
import { loginSchema, type LoginFormData } from '@/lib/utils/validation';
import { getErrorMessage } from '@/lib/api';

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MFA challenge state: when set, the user passed password auth but must enter
  // a TOTP/recovery code to finish (step 2).
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { isSubmitting } = form.formState;

  const completeLogin = (user: Parameters<typeof setUser>[0]) => {
    setUser(user);
    router.push('/chat');
  };

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      const response = await authApi.login({ email: data.email, password: data.password });
      const result = response.data;
      if (response.status === 'success' && result) {
        // MFA-enabled accounts get a challenge instead of a session.
        if (result.mfaRequired && result.mfaToken) {
          setMfaToken(result.mfaToken);
          return;
        }
        completeLogin(result.user);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onVerifyMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setVerifyingMfa(true);
    try {
      const response = await authApi.verifyMfa(mfaToken, mfaCode.trim());
      if (response.status === 'success' && response.data) {
        completeLogin(response.data.user);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setVerifyingMfa(false);
    }
  };

  const cancelMfa = () => {
    setMfaToken(null);
    setMfaCode('');
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          {mfaToken ? t('auth.login.mfaTitle') : t('auth.login.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mfaToken ? t('auth.login.mfaSubtitle') : t('auth.login.subtitle')}
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
          {error}
        </div>
      )}

      {mfaToken ? (
        <form onSubmit={onVerifyMfa} className="space-y-4">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder={t('auth.login.mfaCodePlaceholder')}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            disabled={verifyingMfa}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={verifyingMfa || mfaCode.trim().length < 6}
          >
            {verifyingMfa ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('auth.login.verifying')}
              </>
            ) : (
              t('auth.login.verify')
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={cancelMfa}
            disabled={verifyingMfa}
          >
            {t('auth.login.useDifferentAccount')}
          </Button>
        </form>
      ) : (
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.common.email')}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={t('auth.common.emailPlaceholder')}
                    autoComplete="email"
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t('auth.common.password')}</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    {t('auth.login.forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.login.passwordPlaceholder')}
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      className="pr-10"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">
                      {showPassword ? t('auth.common.hidePassword') : t('auth.common.showPassword')}
                    </span>
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('auth.login.signingIn')}
              </>
            ) : (
              t('auth.login.signIn')
            )}
          </Button>
        </form>
        </Form>
      )}

      {!mfaToken && (
        <div className="text-center text-sm">
          <span className="text-muted-foreground">{t('auth.login.noAccount')}</span>
          <Link href="/register" className="text-primary hover:underline font-medium">
            {t('auth.login.signUp')}
          </Link>
        </div>
      )}
    </div>
  );
}
