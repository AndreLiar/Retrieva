import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface MetricCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label?: string;
  delay?: number;
  color?: string;
  decimals?: number;
  fontSize?: number;
}

export function MetricCounter({
  value,
  suffix = '',
  prefix = '',
  label,
  delay = 0,
  color = COLORS.blue,
  decimals = 0,
  fontSize = FONT_SIZES['2xl'],
}: MetricCounterProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  const displayValue = progress * value;

  return (
    <div
      style={{
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sans,
          fontSize,
          fontWeight: 800,
          color,
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {prefix}
        {decimals > 0
          ? displayValue.toFixed(decimals)
          : Math.round(displayValue).toLocaleString()}
        {suffix}
      </div>

      {label && (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES.sm,
            color: COLORS.textMuted,
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
