'use client';

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssessmentStatus } from '@/lib/api/assessments';

interface Step {
  key: AssessmentStatus;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { key: 'pending', label: 'Submitted', description: 'Assessment created' },
  { key: 'indexing', label: 'Indexing', description: 'Parsing & embedding documents' },
  { key: 'analyzing', label: 'Analyzing', description: 'Running DORA gap analysis' },
  { key: 'complete', label: 'Complete', description: 'Report ready' },
];

const STATUS_ORDER: Record<AssessmentStatus, number> = {
  pending: 0,
  indexing: 1,
  analyzing: 2,
  complete: 3,
  failed: 4,
};

interface AssessmentProgressStepperProps {
  status: AssessmentStatus;
  statusMessage?: string;
}

export function AssessmentProgressStepper({ status, statusMessage }: AssessmentProgressStepperProps) {
  const currentOrder = STATUS_ORDER[status];
  const isFailed = status === 'failed';

  return (
    <div className="w-full">
      <ol className="flex items-start gap-0">
        {STEPS.map((step, i) => {
          const stepOrder = STATUS_ORDER[step.key];
          const isDone = !isFailed && currentOrder > stepOrder;
          const isActive = !isFailed && currentOrder === stepOrder;
          const isUpcoming = currentOrder < stepOrder;
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.key} className={cn('flex-1 flex flex-col', !isLast && 'relative')}>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute top-4 left-1/2 w-full h-0.5 -translate-y-1/2',
                    isDone ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}

              <div className="flex flex-col items-center z-10">
                {/* Icon */}
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background',
                    isDone && 'border-primary text-primary',
                    isActive && !isFailed && 'border-primary text-primary',
                    isUpcoming && 'border-border text-muted-foreground',
                    isFailed && step.key === status && 'border-destructive text-destructive'
                  )}
                >
                  {isFailed && step.key === 'pending' ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>

                {/* Labels */}
                <p
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    (isDone || isActive) && !isFailed ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground text-center hidden sm:block">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Status message */}
      {statusMessage && (
        <p
          className={cn(
            'mt-4 text-sm text-center',
            isFailed ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
