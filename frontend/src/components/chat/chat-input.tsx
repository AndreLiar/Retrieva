'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  isStreaming = false,
  disabled = false,
  placeholder = 'Ask a question about your knowledge base...',
  maxLength = 4000,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Focus textarea on mount
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmedMessage = message.trim();
    console.log('[ChatInput] Submit attempt:', {
      message: trimmedMessage,
      isLoading,
      isStreaming,
      disabled,
      willSubmit: !!(trimmedMessage && !isLoading && !isStreaming && !disabled),
    });
    if (!trimmedMessage || isLoading || isStreaming || disabled) return;

    console.log('[ChatInput] Sending message:', trimmedMessage);
    onSend(trimmedMessage);
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStop = () => {
    if (onStop && isStreaming) {
      onStop();
    }
  };

  const isDisabled = disabled || (!isStreaming && (isLoading || !message.trim()));
  const showStop = isStreaming && onStop;
  const charCount = message.length;
  const isNearLimit = charCount > maxLength * 0.9;

  return (
    <div className="border-t bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'You do not have permission to send messages' : placeholder}
            disabled={disabled || isLoading}
            className={cn(
              'min-h-[52px] max-h-[200px] resize-none pr-24 py-3',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            rows={1}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            {/* Character count */}
            {isNearLimit && (
              <span
                className={cn(
                  'text-xs',
                  charCount >= maxLength ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {charCount}/{maxLength}
              </span>
            )}

            {/* Send/Stop button */}
            {showStop ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-8 w-8"
                onClick={handleStop}
              >
                <StopCircle className="h-4 w-4" />
                <span className="sr-only">Stop generating</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                disabled={isDisabled}
                className="h-8 w-8"
                onClick={handleSubmit}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            )}
          </div>
        </div>

        {/* Help text */}
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to send,{' '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
