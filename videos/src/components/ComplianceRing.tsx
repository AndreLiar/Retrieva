import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface ComplianceRingProps {
  value: number;        // 0–100
  size?: number;
  strokeWidth?: number;
  delay?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

export function ComplianceRing({
  value,
  size = 240,
  strokeWidth = 18,
  delay = 0,
  color = COLORS.green,
  trackColor = COLORS.surfaceAlt,
  label,
  sublabel,
}: ComplianceRingProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = computeSpring(frame, fps, delay, 'slow', 0, value / 100);
  const opacity  = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);
  const displayValue = Math.round(progress * value);

  // Soft outer glow ring (decorative)
  const glowR = r + strokeWidth * 0.8;
  const glowCircumference = 2 * Math.PI * glowR;
  const glowOffset = glowCircumference * (1 - progress);

  return (
    <div style={{ opacity, position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
      >
        {/* Outer glow arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={glowR}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={glowCircumference}
          strokeDashoffset={glowOffset}
          strokeLinecap="round"
          opacity={0.2}
          style={{ filter: `blur(4px)` }}
        />
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${color}cc)` }}
        />
      </svg>

      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: size * 0.26,
            fontWeight: 800,
            color,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          {displayValue}%
        </span>
        {label && (
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: size * 0.085,
              fontWeight: 600,
              color: COLORS.text,
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span
            style={{
              fontFamily: FONTS.sans,
              fontSize: size * 0.07,
              color: COLORS.textMuted,
              textAlign: 'center',
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
