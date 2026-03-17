import { spring, SpringConfig, useCurrentFrame, useVideoConfig } from 'remotion';
import { SPRINGS } from './brand';

export type SpringPreset = keyof typeof SPRINGS;

/**
 * Convenience hook: returns a spring value clamped [0, 1] (or custom from/to).
 */
export function useSpring(
  delayFrames: number,
  preset: SpringPreset = 'smooth',
  from = 0,
  to = 1,
): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: SPRINGS[preset] as SpringConfig,
    from,
    to,
  });
  return s;
}

/**
 * Raw spring value — useful when you need the exact spring with custom params.
 */
export function computeSpring(
  frame: number,
  fps: number,
  delay: number,
  preset: SpringPreset = 'smooth',
  from = 0,
  to = 1,
): number {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: SPRINGS[preset] as SpringConfig,
    from,
    to,
  });
}
