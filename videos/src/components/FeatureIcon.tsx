import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface FeatureIconProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  delay?: number;
  color?: string;
  width?: number;
}

export function FeatureIcon({
  icon,
  title,
  subtitle,
  delay = 0,
  color = COLORS.blue,
  width = 280,
}: FeatureIconProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = computeSpring(frame, fps, delay, 'smooth', 30, 0);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

  return (
    <div
      style={{
        width,
        opacity,
        transform: `translateY(${translateY}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 28,
        background: COLORS.surface,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        boxShadow: SHADOWS.card,
      }}
    >
      {/* Icon container */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: RADIUS.md,
          background: `${color}1a`,
          border: `1px solid ${color}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          fontSize: 24,
        }}
      >
        {icon}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
