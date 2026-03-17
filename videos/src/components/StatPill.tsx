import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface StatPillProps {
  value: string;
  label: string;
  delay?: number;
  color?: string;
}

export function StatPill({ value, label, delay = 0, color = COLORS.blue }: StatPillProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale   = computeSpring(frame, fps, delay, 'bounce', 0.7, 1);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '14px 24px',
        background: `${color}0d`,
        border: `1px solid ${color}33`,
        borderRadius: RADIUS.xl,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES['2xl'],
          fontWeight: 800,
          color,
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.xs,
          color: COLORS.textMuted,
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}
