import React from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS, FONTS, FONT_SIZES } from '../lib/brand';
import { ic } from '../lib/utils';

interface CodeLineProps {
  text: string;
  /** Frame at which to start typing */
  startFrame: number;
  /** Total frames to finish typing */
  durationFrames: number;
  color?: string;
  fontSize?: number;
  showCursor?: boolean;
}

export function CodeLine({
  text,
  startFrame,
  durationFrames,
  color = COLORS.green,
  fontSize = FONT_SIZES.sm,
  showCursor = true,
}: CodeLineProps) {
  const frame = useCurrentFrame();
  const charCount = Math.floor(
    ic(frame, [startFrame, startFrame + durationFrames], [0, text.length]),
  );
  const visible = frame >= startFrame;
  const done = frame >= startFrame + durationFrames;

  if (!visible) return null;

  return (
    <span
      style={{
        fontFamily: FONTS.mono,
        fontSize,
        color,
        letterSpacing: '0.02em',
      }}
    >
      {text.slice(0, charCount)}
      {showCursor && !done && (
        <span
          style={{
            display: 'inline-block',
            width: '0.55em',
            height: '1em',
            background: color,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            opacity: Math.round(frame / 15) % 2 === 0 ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}
