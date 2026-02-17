import { cn } from '@/lib/utils';

interface WorkspaceIconProps {
  icon?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-10 w-10 rounded-lg text-lg',
  md: 'h-14 w-14 rounded-xl text-2xl',
  lg: 'h-16 w-16 rounded-full text-3xl',
} as const;

export function WorkspaceIcon({ icon, size = 'sm', className }: WorkspaceIconProps) {
  return (
    <div
      className={cn(
        'bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center',
        sizeClasses[size],
        className,
      )}
    >
      {icon || '\u{1F4DD}'}
    </div>
  );
}
