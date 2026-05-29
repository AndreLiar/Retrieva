'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/lib/stores/auth-store';
import { organizationsApi } from '@/lib/api/organizations';
import { getErrorMessage } from '@/lib/api';
import { useAuthSession } from '@/lib/hooks';

const onboardingSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  industry: z.enum(['insurance', 'banking', 'investment', 'payments', 'other']),
  country: z.string().max(100).optional(),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, isInitialized } = useAuthStore();
  const { syncCurrentUser } = useAuthSession();
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/login');
    }
    // If user already has an org, skip onboarding
    if (isInitialized && isAuthenticated && user?.organizationId) {
      router.replace('/assessments');
    }
  }, [isInitialized, isAuthenticated, user?.organizationId, router]);

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: '',
      industry: 'other',
      country: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: OnboardingFormData) => {
    setError(null);
    try {
      await organizationsApi.create({
        name: data.name,
        industry: data.industry,
        country: data.country || '',
      });
      await syncCurrentUser();
      toast.success(t('auth.onboarding.toastSuccess', { name: data.name }));
      router.push('/assessments');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!isInitialized || !isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Building2 className="h-10 w-10 mx-auto text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">{t('auth.onboarding.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('auth.onboarding.subtitle')}</p>
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.onboarding.orgName')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('auth.onboarding.orgNamePlaceholder')}
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
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.onboarding.industry')}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('auth.onboarding.industryPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="insurance">{t('auth.onboarding.industries.insurance')}</SelectItem>
                    <SelectItem value="banking">{t('auth.onboarding.industries.banking')}</SelectItem>
                    <SelectItem value="investment">{t('auth.onboarding.industries.investment')}</SelectItem>
                    <SelectItem value="payments">{t('auth.onboarding.industries.payments')}</SelectItem>
                    <SelectItem value="other">{t('auth.onboarding.industries.other')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('auth.onboarding.country')}{' '}
                  <span className="text-muted-foreground">({t('auth.onboarding.optional')})</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('auth.onboarding.countryPlaceholder')}
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
                {t('auth.onboarding.creating')}
              </>
            ) : (
              t('auth.onboarding.create')
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
