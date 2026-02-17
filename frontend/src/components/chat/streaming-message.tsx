'use client';

import { useMemo } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SourceCitations } from './source-citations';
import type { Source } from '@/types';
// ISSUE #39 FIX: Import sanitization utility for XSS protection
import { sanitizeMessageContent, containsSuspiciousContent } from '@/lib/utils/sanitize';

interface StreamingMessageProps {
  content: string;
  status?: string;
  sources?: Source[];
}

export function StreamingMessage({
  content,
  status,
  sources,
}: StreamingMessageProps) {
  const showCursor = content.length > 0;
  const showStatus = status && content.length === 0;

  // ISSUE #39 FIX: Sanitize streaming content for XSS protection
  const sanitizedContent = useMemo(() => {
    if (!content) return '';
    // Log warning if suspicious content detected (for monitoring)
    if (containsSuspiciousContent(content)) {
      console.warn('[Security] Suspicious content detected in stream and sanitized');
    }
    return sanitizeMessageContent(content);
  }, [content]);

  return (
    <div className="group flex gap-3 py-4">
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-muted text-muted-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      {/* Message Content */}
      <div className="flex flex-col gap-2 max-w-[80%]">
        {/* Status indicator */}
        {showStatus && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{status}</span>
          </div>
        )}

        {/* Streaming content - ISSUE #39 FIX: Uses sanitized content */}
        {sanitizedContent.length > 0 && (
          <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap break-words">
                {sanitizedContent}
                {showCursor && (
                  <span className="inline-block w-2 h-4 ml-0.5 bg-foreground/70 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sources (shown when available during streaming) */}
        {sources && sources.length > 0 && (
          <SourceCitations sources={sources} />
        )}
      </div>
    </div>
  );
}

// Typing indicator when waiting for response
export function TypingIndicator() {
  return (
    <div className="flex gap-3 py-4">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-muted text-muted-foreground">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}
