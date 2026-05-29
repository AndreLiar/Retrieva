'use client';

import { useTranslation } from 'react-i18next';
import { AlertCircle, MessageSquarePlus } from 'lucide-react';

import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface ChatEmptyStateProps {
  workspaceName?: string;
  canQuery: boolean;
  onExampleClick: (question: string) => void;
}

const exampleQuestionKeys = ['chat.empty.q1', 'chat.empty.q2', 'chat.empty.q3', 'chat.empty.q4'];

export function ChatEmptyState({
  workspaceName,
  canQuery,
  onExampleClick,
}: ChatEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {workspaceName ? t('chat.empty.welcome', { name: workspaceName }) : t('chat.empty.start')}
        </h2>
        <p className="text-muted-foreground mb-6">
          {t('chat.empty.subtitle')}
        </p>

        {!canQuery && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('chat.empty.readOnly')}
            </AlertDescription>
          </Alert>
        )}

        {canQuery && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">{t('chat.empty.tryAsking')}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {exampleQuestionKeys.map((key) => {
                const question = t(key);
                return (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => onExampleClick(question)}
                    className="text-xs"
                  >
                    {question}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
