'use client';

import { AlertCircle, MessageSquarePlus } from 'lucide-react';

import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

interface ChatEmptyStateProps {
  workspaceName?: string;
  canQuery: boolean;
  onExampleClick: (question: string) => void;
}

const exampleQuestions = [
  'How does authentication work?',
  'What are the main features?',
  'Summarize the documentation',
  'How do I get started?',
];

export function ChatEmptyState({
  workspaceName,
  canQuery,
  onExampleClick,
}: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {workspaceName ? `Welcome to ${workspaceName}` : 'Start a Conversation'}
        </h2>
        <p className="text-muted-foreground mb-6">
          Ask questions about your knowledge base and get AI-powered answers with source citations.
        </p>

        {!canQuery && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have read-only access. Contact the workspace owner for query permissions.
            </AlertDescription>
          </Alert>
        )}

        {canQuery && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {exampleQuestions.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  onClick={() => onExampleClick(question)}
                  className="text-xs"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
