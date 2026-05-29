'use client';

import { useTranslation } from 'react-i18next';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { ComplianceScore } from '@/features/workspaces/api/workspaces';

interface ComplianceScoreCardProps {
  score: ComplianceScore | null;
}

const STATUS_STYLES = {
  green: 'text-green-700 bg-green-50 border-green-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red: 'text-red-700 bg-red-50 border-red-200',
} as const;

const STATUS_LABEL_KEY = {
  green: 'workspaces.score.good',
  amber: 'workspaces.score.needsAttention',
  red: 'workspaces.score.atRisk',
} as const;

export function ComplianceScoreCard({ score }: ComplianceScoreCardProps) {
  const { t } = useTranslation();
  if (!score) return null;

  const TrendIcon = score.trend > 0 ? TrendingUp : score.trend < 0 ? TrendingDown : Minus;
  const trendColor =
    score.trend > 0
      ? 'text-green-600'
      : score.trend < 0
        ? 'text-red-600'
        : 'text-muted-foreground';
  const trendLabel =
    score.trend > 0
      ? t('workspaces.score.trendUp', { pts: score.trend })
      : score.trend < 0
        ? t('workspaces.score.trendDown', { pts: score.trend })
        : t('workspaces.score.noChange');

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t('workspaces.score.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div
            className={`text-4xl font-bold tabular-nums px-4 py-2 rounded-md border ${STATUS_STYLES[score.status]}`}
          >
            {score.score}
          </div>
          <div className="space-y-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[score.status]}`}
            >
              {t(STATUS_LABEL_KEY[score.status])}
            </span>
            <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {trendLabel} {t('workspaces.score.vs30')}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('workspaces.score.assessmentCount', { count: score.assessmentCount })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
