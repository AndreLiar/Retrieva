'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';

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
import { authApi, getErrorMessage } from '@/lib/api';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/utils/validation';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setError(null);
    try {
      await authApi.forgotPassword(data);
      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{t('auth.forgot.successTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('auth.forgot.successSubtitle')}</p>
        </div>
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setIsSuccess(false);
              form.reset();
            }}
          >
            {t('auth.forgot.tryAnother')}
          </Button>
          <Link href="/login">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('auth.forgot.backToLogin')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{t('auth.forgot.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('auth.forgot.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
          {error}
        </div>
      )}

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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('auth.forgot.sending')}
              </>
            ) : (
              t('auth.forgot.sendLink')
            )}
          </Button>
        </form>
      </Form>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ArrowLeft className="mr-1 h-3 w-3" />
          {t('auth.forgot.backToLogin')}
        </Link>
      </div>
    </div>
  );
}
