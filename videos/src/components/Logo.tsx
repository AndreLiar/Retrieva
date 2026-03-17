import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface LogoProps {
  delay?: number;
  size?: 'sm' | 'md' | 'lg';
  position?: 'center' | 'top-left' | 'top-right';
}

const SIZES = {
  sm: { icon: 28, text: FONT_SIZES.md },
  md: { icon: 40, text: FONT_SIZES.lg },
  lg: { icon: 56, text: FONT_SIZES['2xl'] },
} as const;

export function Logo({ delay = 0, size = 'md', position = 'center' }: LogoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = computeSpring(frame, fps, delay, 'bounce', 0.6, 1);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  const { icon: iconSize, text: textSize } = SIZES[size];

  const positionStyle: React.CSSProperties =
    position === 'center'
      ? { display: 'flex', justifyContent: 'center', alignItems: 'center' }
      : position === 'top-left'
        ? { position: 'absolute', top: 40, left: 48 }
        : { position: 'absolute', top: 40, right: 48 };

  return (
    <div
      style={{
        ...positionStyle,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: iconSize * 0.3,
        }}
      >
        {/* ShieldCheck SVG */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.blue}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>

        {/* Wordmark */}
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: textSize,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: '-0.02em',
          }}
        >
          Retrieva
        </span>
      </div>
    </div>
  );
}
