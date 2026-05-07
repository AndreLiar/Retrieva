'use client';

import { useState, useMemo } from 'react';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Message } from '@/types';
import { SourceCitations, SourceReference } from './source-citations';
// ISSUE #39 FIX: Import sanitization utility for XSS protection
import { sanitizeMessageContent, containsSuspiciousContent } from '@/lib/utils/sanitize';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onFeedback?: (feedback: 'positive' | 'negative' | null) => void;
  onRegenerate?: () => void;
  showActions?: boolean;
}

export function MessageBubble({
  message,
  isStreaming = false,
  onFeedback,
  onRegenerate,
  showActions = true,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (feedback: 'positive' | 'negative') => {
    if (!onFeedback) return;
    // Toggle off if same feedback, otherwise set new feedback
    if (message.feedback === feedback) {
      onFeedback(null);
    } else {
      onFeedback(feedback);
    }
  };

  return (
    <div
      className={cn(
        'group flex gap-3 py-4',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Message Content */}
      <div
        className={cn(
          'flex flex-col gap-2 max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          )}
        >
          {/* Message text with markdown support */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MessageContent
              content={message.content}
              isStreaming={isStreaming}
              messageId={message.id}
              sourcesCount={message.sources?.length ?? 0}
            />
          </div>
        </div>

        {/* Source citations for assistant messages */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} messageId={message.id} />
        )}

        {/* Actions for assistant messages */}
        {/* A11Y FIX: Added focus-within:opacity-100 for keyboard navigation */}
        {!isUser && showActions && !isStreaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <TooltipProvider>
              {/* Copy button */}
              {/* A11Y FIX: Added aria-label for screen readers */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{copied ? 'Copied!' : 'Copy'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Feedback buttons */}
              {onFeedback && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7',
                          message.feedback === 'positive' && 'text-green-500'
                        )}
                        onClick={() => handleFeedback('positive')}
                        aria-label="Mark as good response"
                        aria-pressed={message.feedback === 'positive'}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Good response</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7',
                          message.feedback === 'negative' && 'text-red-500'
                        )}
                        onClick={() => handleFeedback('negative')}
                        aria-label="Mark as bad response"
                        aria-pressed={message.feedback === 'negative'}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Bad response</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Regenerate button */}
              {onRegenerate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={onRegenerate}
                      aria-label="Regenerate response"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Regenerate</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
}

function scrollToSource(messageId: string, n: number) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(`source-${messageId}-${n}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  el.classList.add('ring-2', 'ring-primary');
  setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1200);
}

function renderLineWithCitations(
  line: string,
  messageId: string | undefined,
  sourcesCount: number,
  keyPrefix: string
) {
  if (!messageId || sourcesCount === 0) return line;
  const parts: Array<string | { idx: number }> = [];
  const regex = /\[Source (\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    const idx = Number(match[1]);
    if (idx >= 1 && idx <= sourcesCount) parts.push({ idx });
    else parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (parts.length === 0) return line;
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.map((part, i) => {
    if (typeof part === 'string') return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    return (
      <SourceReference
        key={`${keyPrefix}-${i}`}
        index={part.idx}
        onClick={() => scrollToSource(messageId, part.idx)}
      />
    );
  });
}

// Simple markdown-like content renderer
// ISSUE #39 FIX: Added XSS sanitization for message content
function MessageContent({
  content,
  isStreaming,
  messageId,
  sourcesCount = 0,
}: {
  content: string;
  isStreaming: boolean;
  messageId?: string;
  sourcesCount?: number;
}) {
  const sanitizedContent = useMemo(() => {
    containsSuspiciousContent(content);
    return sanitizeMessageContent(content);
  }, [content]);

  const lines = sanitizedContent.split('\n');

  return (
    <div className="whitespace-pre-wrap break-words">
      {lines.map((line, i) => (
        <span key={i}>
          {renderLineWithCitations(line, messageId, sourcesCount, `m-${i}`)}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse" />
      )}
    </div>
  );
}
