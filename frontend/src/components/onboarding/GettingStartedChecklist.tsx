'use client';

import { useRouter } from 'next/navigation';
import { Check, X, Building2, ShieldCheck, ClipboardList, Users, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import type { OnboardingChecklist } from '@/types';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  key: keyof Omit<OnboardingChecklist, 'dismissed'>;
  icon: React.ElementType;
  label: string;
  cta: string;
  onClick: () => void;
}

interface Props {
  checklist: OnboardingChecklist;
}

export function GettingStartedChecklist({ checklist }: Props) {
  const router = useRouter();
  const updateUser = useAuthStore((state) => state.updateUser);
  const openModal = useUIStore((state) => state.openModal);

  const dismiss = async () => {
    try {
      await authApi.updateOnboarding({ checklist: { dismissed: true } });
    } catch {
      // Non-critical
    }
    updateUser({
      onboardingChecklist: { ...checklist, dismissed: true },
    });
  };

  const items: ChecklistItem[] = [
    {
      key: 'vendorCreated',
      icon: Building2,
      label: 'Add your first vendor',
      cta: 'Add vendor',
      onClick: () => openModal(MODAL_IDS.CREATE_WORKSPACE),
    },
    {
      key: 'assessmentCreated',
      icon: ShieldCheck,
      label: 'Run your first gap analysis',
      cta: 'New analysis',
      onClick: () => router.push('/assessments/new'),
    },
    {
      key: 'memberInvited',
      icon: Users,
      label: 'Invite a team member',
      cta: 'Invite',
      onClick: () => router.push('/settings/team'),
    },
    {
      key: 'monitoringSetup',
      icon: Activity,
      label: 'Set up vendor monitoring',
      cta: 'Configure',
      onClick: () => router.push('/workspaces'),
    },
  ];

  // Always show org creation as done (user is in dashboard = org exists)
  const orgItem = {
    key: 'org' as const,
    icon: ClipboardList,
    label: 'Create your organisation',
    done: true,
  };

  const completedCount = 1 + items.filter((i) => checklist[i.key]).length;
  const totalCount = 1 + items.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  if (checklist.dismissed) return null;

  return (
    <div className="mb-6 rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold">Getting started</p>
          <span className="text-xs text-muted-foreground">
            {completedCount} of {totalCount} complete
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={dismiss}
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-1 bg-primary transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Items */}
      <div className="divide-y">
        {/* Org item — always done */}
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="h-5 w-5 shrink-0 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
          </div>
          <orgItem.icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground line-through">{orgItem.label}</span>
        </div>

        {items.map(({ key, icon: Icon, label, cta, onClick }) => {
          const done = checklist[key];
          return (
            <div key={key} className="flex items-center gap-3 px-5 py-3">
              <div
                className={cn(
                  'h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                  done
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/30 bg-transparent'
                )}
              >
                {done && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </div>
              <Icon className={cn('h-4 w-4 shrink-0', done ? 'text-muted-foreground' : 'text-foreground')} />
              <span className={cn('flex-1 text-sm', done && 'text-muted-foreground line-through')}>
                {label}
              </span>
              {!done && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClick}>
                  {cta}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
