import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface BadgeProps {
  text: string;
  delay?: number;
  color?: string;
  icon?: React.ReactNode;
  variant?: 'outline' | 'filled';
}

export function Badge({
  text,
  delay = 0,
  color = COLORS.blue,
  icon,
  variant = 'outline',
}: BadgeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  const scale = computeSpring(frame, fps, delay, 'bounce', 0.8, 1);

  const bgColor = variant === 'filled' ? color : `${color}1a`;
  const borderColor = `${color}66`;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: RADIUS.full,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {icon && (
        <span style={{ display: 'flex', alignItems: 'center', color }}>{icon}</span>
      )}
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.xs,
          fontWeight: 600,
          color: variant === 'filled' ? '#fff' : color,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}
