import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../../lib/brand';
import { Callout } from '../../components/Callout';

const CALLOUTS = [
  {
    from: 60,
    duration: 120,
    text: 'AI-powered semantic chunking',
    x: 640,
    y: 320,
    tooltipX: 720,
    tooltipY: 240,
    color: COLORS.blue,
  },
  {
    from: 240,
    duration: 120,
    text: '78% overall DORA coverage',
    x: 960,
    y: 480,
    tooltipX: 1020,
    tooltipY: 380,
    color: COLORS.green,
  },
  {
    from: 420,
    duration: 120,
    text: 'LLM scoring: 74.2/100',
    x: 480,
    y: 560,
    tooltipX: 560,
    tooltipY: 460,
    color: COLORS.purple,
  },
  {
    from: 600,
    duration: 120,
    text: 'Cert expiry in 30 days',
    x: 1200,
    y: 400,
    tooltipX: 1040,
    tooltipY: 300,
    color: COLORS.orange,
  },
];

export function CalloutSequence() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {CALLOUTS.map((c) => (
        <Sequence key={c.from} from={c.from} durationInFrames={c.duration}>
          <Callout
            text={c.text}
            x={c.x}
            y={c.y}
            tooltipX={c.tooltipX}
            tooltipY={c.tooltipY}
            frame={frame - c.from}
            fps={fps}
            delay={0}
            color={c.color}
          />
        </Sequence>
      ))}
    </>
  );
}
