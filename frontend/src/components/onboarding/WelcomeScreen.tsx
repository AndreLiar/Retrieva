'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';

export function WelcomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const openModal = useUIStore((state) => state.openModal);
  const [dismissing, setDismissing] = useState(false);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const dismiss = async (then?: () => void) => {
    if (dismissing) return;
    setDismissing(true);
    try {
      await authApi.updateOnboarding({ completed: true });
      updateUser({ onboardingCompleted: true });
      then?.();
    } catch {
      // Non-critical — still dismiss locally
      updateUser({ onboardingCompleted: true });
      then?.();
    }
  };

  const actions = [
    {
      icon: Building2,
      title: 'Add your first vendor',
      description: 'Create a workspace for an ICT vendor and start the DORA compliance workflow.',
      cta: 'Add vendor',
      onClick: () => dismiss(() => openModal(MODAL_IDS.CREATE_WORKSPACE)),
    },
    {
      icon: Users,
      title: 'Invite your team',
      description: 'Bring in your compliance analysts, ICT risk managers, and stakeholders.',
      cta: 'Invite members',
      onClick: () => dismiss(() => router.push('/settings/team')),
    },
    {
      icon: BookOpen,
      title: 'Read the playbook',
      description: 'A step-by-step guide to everything Retrieva can do for your team.',
      cta: 'Open playbook',
      onClick: () => dismiss(() => window.open('https://retrieva.online', '_blank')),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-xl border bg-card shadow-2xl p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Retrieva</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-4">
          Welcome, {firstName} 👋
        </h1>
        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
          Retrieva helps you assess ICT vendors against DORA requirements, identify compliance gaps,
          and monitor risk in real time. Here&apos;s how to get started.
        </p>

        {/* Action cards */}
        <div className="mt-6 grid gap-3">
          {actions.map(({ icon: Icon, title, description, cta, onClick }) => (
            <button
              key={title}
              onClick={onClick}
              className="group flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 hover:border-primary/30"
            >
              <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {cta}
                <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            You can always find these options in the sidebar.
          </p>
          <Button onClick={() => dismiss()} disabled={dismissing}>
            Get started
          </Button>
        </div>
      </div>
    </div>
  );
}
