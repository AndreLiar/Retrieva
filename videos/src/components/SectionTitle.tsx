import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface SectionTitleProps {
  title: string;
  subline?: string;
  delay?: number;
  align?: 'left' | 'center';
  fontSize?: number;
  color?: string;
  accentColor?: string;
  accentWord?: string;
}

export function SectionTitle({
  title,
  subline,
  delay = 0,
  align = 'center',
  fontSize = FONT_SIZES.xl,
  color = COLORS.text,
  accentColor = COLORS.blue,
  accentWord,
}: SectionTitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = computeSpring(frame, fps, delay, 'smooth', 20, 0);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  const subOpacity = computeSpring(frame, fps, delay + 12, 'smooth', 0, 1);

  // Accent underline width
  const underlineWidth = computeSpring(frame, fps, delay + 8, 'smooth', 0, 1);

  const renderTitle = () => {
    if (!accentWord) {
      return (
        <span style={{ color }}>{title}</span>
      );
    }

    const parts = title.split(accentWord);
    return (
      <>
        {parts[0]}
        <span style={{ color: accentColor }}>{accentWord}</span>
        {parts[1]}
      </>
    );
  };

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: align,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      <h2
        style={{
          fontFamily: FONTS.sans,
          fontSize,
          fontWeight: 700,
          color,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {renderTitle()}
      </h2>

      {/* Accent underline */}
      <div
        style={{
          height: 3,
          width: `${underlineWidth * 60}px`,
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          borderRadius: 2,
        }}
      />

      {subline && (
        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES.md,
            color: COLORS.textMuted,
            margin: 0,
            opacity: subOpacity,
            maxWidth: 600,
            lineHeight: 1.5,
          }}
        >
          {subline}
        </p>
      )}
    </div>
  );
}
