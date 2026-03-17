import React from 'react';
import { COLORS } from '../lib/brand';

type Variant = 'solid' | 'grid' | 'gradient';

interface BackgroundProps {
  variant?: Variant;
  children?: React.ReactNode;
  transparent?: boolean;
}

const GRID_STYLE = `
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 60px 60px;
`;

const GRADIENT_STYLE = `
  background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 60%),
              radial-gradient(ellipse 60% 40% at 80% 80%, rgba(34,197,94,0.05) 0%, transparent 50%),
              ${COLORS.bg};
`;

export function Background({ variant = 'solid', children, transparent = false }: BackgroundProps) {
  const getBackground = () => {
    if (transparent) return 'transparent';
    if (variant === 'gradient') return undefined;
    return COLORS.bg;
  };

  const additionalStyle: React.CSSProperties =
    variant === 'gradient'
      ? {
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 60%),
                       radial-gradient(ellipse 60% 40% at 80% 80%, rgba(34,197,94,0.05) 0%, transparent 50%),
                       ${COLORS.bg}`,
        }
      : {};

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: getBackground(),
        position: 'relative',
        overflow: 'hidden',
        ...additionalStyle,
      }}
    >
      {/* Google Fonts injection for Chromium renderer */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Grid overlay */}
      {variant === 'grid' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }}
        />
      )}

      {children}
    </div>
  );
}
