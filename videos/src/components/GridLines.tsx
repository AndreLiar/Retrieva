import React from 'react';

interface GridLinesProps {
  opacity?: number;
  spacing?: number;
  color?: string;
}

export function GridLines({
  opacity = 0.04,
  spacing = 60,
  color = 'rgba(255,255,255,1)',
}: GridLinesProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(${color} 1px, transparent 1px),
          linear-gradient(90deg, ${color} 1px, transparent 1px)
        `,
        backgroundSize: `${spacing}px ${spacing}px`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
}
