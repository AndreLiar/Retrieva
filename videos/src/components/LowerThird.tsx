import React from 'react';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface LowerThirdProps {
  title: string;
  subtitle?: string;
  frame: number;
  fps: number;
  delay?: number;
  color?: string;
}

export function LowerThird({
  title,
  subtitle,
  frame,
  fps,
  delay = 0,
  color = COLORS.blue,
}: LowerThirdProps) {
  const translateX = computeSpring(frame, fps, delay, 'snappy', -120, 0);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 4,
        padding: '14px 20px',
        background: COLORS.surface,
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${color}`,
        opacity,
        transform: `translateX(${translateX}px)`,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.base,
          fontWeight: 600,
          color: COLORS.text,
        }}
      >
        {title}
      </span>

      {subtitle && (
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES.sm,
            color: COLORS.textMuted,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
