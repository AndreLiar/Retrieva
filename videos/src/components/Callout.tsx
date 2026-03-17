import React from 'react';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../lib/brand';
import { computeSpring } from '../lib/spring';

interface CalloutProps {
  text: string;
  x: number; // anchor x
  y: number; // anchor y
  tooltipX: number;
  tooltipY: number;
  frame: number;
  fps: number;
  delay?: number;
  color?: string;
}

export function Callout({
  text,
  x,
  y,
  tooltipX,
  tooltipY,
  frame,
  fps,
  delay = 0,
  color = COLORS.blue,
}: CalloutProps) {
  const scale = computeSpring(frame, fps, delay, 'bounce', 0, 1);
  const tooltipOpacity = computeSpring(frame, fps, delay + 10, 'smooth', 0, 1);

  // Pulsing dot radius
  const pulse = Math.sin((frame - delay) * 0.15) * 4 + 10;

  if (frame < delay) return null;

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      {/* Pulsing circle */}
      <circle
        cx={x}
        cy={y}
        r={pulse}
        fill={`${color}22`}
        stroke={color}
        strokeWidth={2}
        opacity={scale}
      />
      <circle cx={x} cy={y} r={5} fill={color} opacity={scale} />

      {/* Dashed line */}
      <line
        x1={x}
        y1={y}
        x2={tooltipX}
        y2={tooltipY}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="6 4"
        opacity={tooltipOpacity}
      />

      {/* Tooltip box (foreign object) */}
      <foreignObject
        x={tooltipX - 10}
        y={tooltipY - 20}
        width={220}
        height={60}
        opacity={tooltipOpacity}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            background: COLORS.surface,
            border: `1px solid ${color}66`,
            borderRadius: RADIUS.md,
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES.xs,
            color: COLORS.text,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      </foreignObject>
    </svg>
  );
}
