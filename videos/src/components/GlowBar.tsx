import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface GlowBarProps {
  value: number; // 0–100
  delay?: number;
  color?: string;
  glowColor?: string;
  height?: number;
  label?: string;
  showPercent?: boolean;
  width?: number;
}

export function GlowBar({
  value,
  delay = 0,
  color = COLORS.blue,
  glowColor,
  height = 12,
  label,
  showPercent = true,
  width = 400,
}: GlowBarProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = computeSpring(frame, fps, delay, 'smooth', 0, value / 100);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  const glow = glowColor ?? `${color}66`;
  const displayValue = Math.round(progress * value);

  return (
    <div style={{ opacity, width }}>
      {/* Label row */}
      {(label || showPercent) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 8,
            fontFamily: "'Geist', sans-serif",
            fontSize: 14,
            color: COLORS.textMuted,
          }}
        >
          {label && <span>{label}</span>}
          {showPercent && (
            <span style={{ color, fontWeight: 600 }}>{displayValue}%</span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        style={{
          width: '100%',
          height,
          background: COLORS.surfaceAlt,
          borderRadius: RADIUS.full,
          overflow: 'hidden',
          border: `1px solid ${COLORS.border}`,
          position: 'relative',
        }}
      >
        {/* Fill */}
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: color,
            borderRadius: RADIUS.full,
            boxShadow: `0 0 16px 2px ${glow}, 0 0 6px 1px ${glow}`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
}
