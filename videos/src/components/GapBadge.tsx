import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, GAP_COLORS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

type Status = 'covered' | 'partial' | 'missing';

interface GapBadgeProps {
  status: Status;
  label?: string;
  delay?: number;
}

const LABELS: Record<Status, string> = {
  covered: 'Covered',
  partial: 'Partial',
  missing: 'Missing',
};

export function GapBadge({ status, label, delay = 0 }: GapBadgeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = computeSpring(frame, fps, delay, 'bounce', 0, 1);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  const color = GAP_COLORS[status];
  const text = label ?? LABELS[status];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: RADIUS.full,
        background: `${color}1a`,
        border: `1px solid ${color}66`,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px 2px ${color}88`,
        }}
      />
      <span
        style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.xs,
          fontWeight: 600,
          color,
        }}
      >
        {text}
      </span>
    </div>
  );
}
