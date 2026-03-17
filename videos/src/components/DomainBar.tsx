import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface DomainBarProps {
  label: string;
  weight: number;   // 0–100 (DORA domain weight)
  coverage: number; // 0–100 (current coverage)
  delay?: number;
  accentColor?: string;
  width?: number;
}

export function DomainBar({
  label,
  weight,
  coverage,
  delay = 0,
  accentColor = COLORS.blue,
  width = 500,
}: DomainBarProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const weightProg = computeSpring(frame, fps, delay, 'smooth', 0, weight / 100);
  const coverProg = computeSpring(frame, fps, delay + 8, 'smooth', 0, coverage / 100);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  const HEIGHT = 10;
  const GAP = 6;

  return (
    <div style={{ opacity, width, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Label */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.xs,
          color: COLORS.textMuted,
        }}
      >
        <span>{label}</span>
        <span style={{ color: accentColor, fontWeight: 600 }}>{Math.round(coverProg * coverage)}%</span>
      </div>

      {/* Weight bar (grey) */}
      <div
        style={{
          width: '100%',
          height: HEIGHT,
          background: COLORS.surfaceAlt,
          borderRadius: RADIUS.full,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${weightProg * 100}%`,
            height: '100%',
            background: COLORS.border,
            borderRadius: RADIUS.full,
          }}
        />
      </div>

      {/* Coverage bar (accent) */}
      <div
        style={{
          width: '100%',
          height: HEIGHT,
          background: COLORS.surfaceAlt,
          borderRadius: RADIUS.full,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
          marginTop: -GAP,
        }}
      >
        <div
          style={{
            width: `${coverProg * 100}%`,
            height: '100%',
            background: accentColor,
            borderRadius: RADIUS.full,
            boxShadow: `0 0 10px 2px ${accentColor}66`,
          }}
        />
      </div>
    </div>
  );
}
