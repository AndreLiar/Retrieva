import { cn } from '@/shared/utils';

/**
 * Retrieva brand mark — a concentration / nth-party dependency GRAPH glyph: a hub node
 * linked to satellite nodes. It evokes the product's moat (the vendor→subprocessor graph)
 * and "retrieval". Electric-blue→cyan gradient by default; pass `mono` to inherit currentColor.
 */
export function LogoMark({
  className,
  mono = false,
  title = 'Retrieva',
}: {
  className?: string;
  mono?: boolean;
  title?: string;
}) {
  const stroke = mono ? 'currentColor' : 'url(#retrievaEdge)';
  const fill = mono ? 'currentColor' : 'url(#retrievaNode)';
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-7 w-7', className)}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {!mono && (
        <defs>
          <linearGradient id="retrievaEdge" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="retrievaNode" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
      )}
      {/* edges (hub → satellites) */}
      <g stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={mono ? 0.55 : 0.9}>
        <line x1="16" y1="16" x2="7" y2="7" />
        <line x1="16" y1="16" x2="26" y2="8" />
        <line x1="16" y1="16" x2="8" y2="25" />
        <line x1="16" y1="16" x2="25" y2="24" />
      </g>
      {/* satellite nodes */}
      <g fill={fill}>
        <circle cx="7" cy="7" r="2.6" />
        <circle cx="26" cy="8" r="2.6" />
        <circle cx="8" cy="25" r="2.6" />
        <circle cx="25" cy="24" r="2.6" />
      </g>
      {/* hub node */}
      <circle cx="16" cy="16" r="4.2" fill={mono ? 'currentColor' : 'url(#retrievaNode)'} />
      <circle cx="16" cy="16" r="4.2" fill="none" stroke={mono ? 'transparent' : '#0A0E14'} strokeWidth="1.4" opacity="0.25" />
    </svg>
  );
}

/**
 * Full lockup: mark + "Retrieva" wordmark (bold display font). Use in headers/footers.
 */
export function Logo({
  className,
  markClassName,
  mono = false,
}: {
  className?: string;
  markClassName?: string;
  mono?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark mono={mono} className={markClassName} />
      <span className="font-display text-xl font-bold tracking-tight">Retrieva</span>
    </span>
  );
}
