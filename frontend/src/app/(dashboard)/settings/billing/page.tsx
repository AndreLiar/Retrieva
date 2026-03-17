'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
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

function getDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
}

export default function BillingSettingsPage() {
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
        window.location.href = url;
      }
    },
    onError: () => {
      toast.error('Could not open billing portal. Please try again.');
    },
  });

  const isTrialing = planStatus === 'trialing';
  const isActive = planStatus === 'active';
  const isPastDue = planStatus === 'past_due' || planStatus === 'paused';
  const isCanceled = planStatus === 'canceled';

  const portalButtonLabel =
    isActive ? 'Manage billing' : 'Add payment method';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href="/settings">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          Billing
        </h1>
        <p className="text-muted-foreground">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Plan Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Plan Status
            {isTrialing && (
              <Badge variant="outline" className="border-blue-500 text-blue-600">
                Trialing
              </Badge>
            )}
            {isActive && (
              <Badge className="bg-green-600 text-white">Active</Badge>
            )}
            {isPastDue && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                {planStatus === 'paused' ? 'Paused' : 'Past Due'}
              </Badge>
            )}
            {isCanceled && (
              <Badge variant="destructive">Canceled</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {org?.plan ? `Plan: ${org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}` : 'Starter plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTrialing && daysLeft !== null && daysLeft > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                <strong>{daysLeft} {daysLeft === 1 ? 'day' : 'days'}</strong> left in your free trial
              </span>
            </div>
          )}
          {isTrialing && (daysLeft === null || daysLeft === 0) && (
            <p className="text-sm text-muted-foreground">Your trial has ended.</p>
          )}
          {isActive && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Your subscription is active</span>
            </div>
          )}
          {isPastDue && (
            <Alert className="border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                Add a payment method to restore access
              </AlertDescription>
            </Alert>
          )}
          {isCanceled && (
            <p className="text-sm text-muted-foreground">Your subscription has been canceled.</p>
          )}
        </CardContent>
      </Card>

      {/* Manage Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Method
          </CardTitle>
          <CardDescription>
            {isActive
              ? 'View and manage your billing details in the Stripe portal'
              : 'Add a payment method to continue using Retrieva after your trial'}
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
