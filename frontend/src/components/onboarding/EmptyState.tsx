'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  description: string;
  cta: string;
  onAction: () => void;
  hint?: string;
}

export function EmptyState({ icon: Icon, heading, description, cta, onAction, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mb-5">
        <Icon className="h-7 w-7 text-muted-foreground/60" />
      </div>
      <h2 className="text-base font-semibold mb-1.5">{heading}</h2>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-5">
        {description}
      </p>
      <Button onClick={onAction}>{cta}</Button>
      {hint && (
        <p className="mt-4 text-xs text-muted-foreground/70 max-w-xs leading-relaxed">{hint}</p>
      )}
    </div>
  );
}
