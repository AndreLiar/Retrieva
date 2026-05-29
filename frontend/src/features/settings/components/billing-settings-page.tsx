'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { billingApi } from '@/lib/api/billing';
import { organizationsApi } from '@/lib/api/organizations';
import { navigateWindowTo } from '@/lib/navigation';

function getDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
}

export function BillingSettingsPage() {
  const { t } = useTranslation();
  const { data: orgData } = useQuery({
    queryKey: ['org'],
    queryFn: organizationsApi.getMe,
  });

  const org = orgData?.data?.organization;
  const planStatus = org?.planStatus ?? 'trialing';
  const trialEndsAt = org?.trialEndsAt ?? null;
  const daysLeft = getDaysLeft(trialEndsAt);

  const portalMutation = useMutation({
    mutationFn: billingApi.createPortalSession,
    onSuccess: (data) => {
      const url = data.data?.url;
      if (url) {
        navigateWindowTo(url);
      }
    },
    onError: () => {
      toast.error(t('settings.billing.toastPortalFailed'));
    },
  });

  const isTrialing = planStatus === 'trialing';
  const isActive = planStatus === 'active';
  const isPastDue = planStatus === 'past_due' || planStatus === 'paused';
  const isCanceled = planStatus === 'canceled';

  const portalButtonLabel =
    isActive ? t('settings.billingLink.manage') : t('settings.billing.addPayment');

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href="/settings">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('settings.security.back')}
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          {t('settings.billingLink.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings.billingLink.desc')}
        </p>
      </div>

      {/* Plan Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {t('settings.billing.planStatus')}
            {isTrialing && (
              <Badge variant="outline" className="border-blue-500 text-blue-600">
                {t('settings.billing.trialing')}
              </Badge>
            )}
            {isActive && (
              <Badge className="bg-green-600 text-white">{t('settings.billing.active')}</Badge>
            )}
            {isPastDue && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                {planStatus === 'paused' ? t('settings.billing.paused') : t('settings.billing.pastDue')}
              </Badge>
            )}
            {isCanceled && (
              <Badge variant="destructive">{t('settings.billing.canceled')}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {org?.plan ? t('settings.billing.planLabel', { plan: org.plan.charAt(0).toUpperCase() + org.plan.slice(1) }) : t('settings.billing.starterPlan')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTrialing && daysLeft !== null && daysLeft > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                <strong>{t('settings.billing.daysCount', { count: daysLeft })}</strong> {t('settings.billing.trialSuffix')}
              </span>
            </div>
          )}
          {isTrialing && (daysLeft === null || daysLeft === 0) && (
            <p className="text-sm text-muted-foreground">{t('settings.billing.trialEnded')}</p>
          )}
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('settings.billing.subActive')}</span>
            </div>
          )}
          {isPastDue && (
            <Alert className="border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                {t('settings.billing.pastDueAlert')}
              </AlertDescription>
            </Alert>
          )}
          {isCanceled && (
            <p className="text-sm text-muted-foreground">{t('settings.billing.subCanceled')}</p>
          )}
        </CardContent>
      </Card>

      {/* Manage Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('settings.billing.paymentMethod')}
          </CardTitle>
          <CardDescription>
            {isActive
              ? t('settings.billing.paymentDescActive')
              : t('settings.billing.paymentDescInactive')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
          >
            {portalMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 mr-2" />
            )}
            {portalButtonLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
