'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Source } from '@/types';

/**
 * ISSUE #51 FIX: Validate external URLs to prevent XSS and unsafe protocols
 * Only allows http and https URLs
 */
function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface SourceCitationsProps {
  sources: Source[];
  maxVisible?: number;
}

export function SourceCitations({ sources, maxVisible = 3 }: SourceCitationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  if (!sources || sources.length === 0) return null;

  const visibleSources = isExpanded ? sources : sources.slice(0, maxVisible);
  const hasMore = sources.length > maxVisible;

  const toggleSource = (sourceId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  return (
    <div className="w-full mt-2">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Sources ({sources.length})
        </span>
      </div>

      <div className="space-y-2">
        {visibleSources.map((source, index) => (
          <SourceCard
            key={source.id || index}
            source={source}
            index={index + 1}
            isExpanded={expandedSources.has(source.id)}
            onToggle={() => toggleSource(source.id)}
          />
        ))}
      </div>

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show {sources.length - maxVisible} more sources
            </>
          )}
        </Button>
      )}
    </div>
  );
}

interface SourceCardProps {
  source: Source;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function SourceCard({ source, index, isExpanded, onToggle }: SourceCardProps) {
  const hasContent = source.content && source.content.length > 0;
  const truncatedContent =
    source.content && source.content.length > 200
      ? source.content.slice(0, 200) + '...'
      : source.content;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-start gap-2 p-2.5 text-left hover:bg-muted/50 transition-colors',
              isExpanded && 'bg-muted/30'
            )}
          >
            <Badge
              variant="secondary"
              className="h-5 w-5 p-0 flex items-center justify-center shrink-0 text-[10px]"
            >
              {index}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{source.title}</p>
              {source.score !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Relevance: {Math.round(source.score * 100)}%
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* ISSUE #51 FIX: Only render link if URL is valid (http/https) */}
              {source.url && isValidExternalUrl(source.url) && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 hover:bg-muted rounded"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
              {hasContent && (
                <div className="p-1">
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        {hasContent && (
          <CollapsibleContent>
            <div className="px-2.5 pb-2.5 pt-0">
              <ScrollArea className="max-h-40">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {isExpanded ? source.content : truncatedContent}
                </p>
              </ScrollArea>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

// Inline source reference badge (for use within message text)
export function SourceReference({
  index,
  onClick,
}: {
  index: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center h-4 w-4 text-[10px] font-medium bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors mx-0.5"
    >
      {index}
    </button>
  );
}
