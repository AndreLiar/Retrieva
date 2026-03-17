import { interpolate } from 'remotion';

/**
 * Interpolate-clamp shorthand (ic).
 * Maps frame from inputRange to outputRange, clamped by default.
 */
export function ic(
  frame: number,
  inputRange: [number, number],
  outputRange: [number, number],
  extrapolateLeft: 'clamp' | 'extend' = 'clamp',
  extrapolateRight: 'clamp' | 'extend' = 'clamp',
): number {
  return interpolate(frame, inputRange, outputRange, {
    extrapolateLeft,
    extrapolateRight,
  });
}

/**
 * Returns true when frame is within [start, end].
 */
export function active(frame: number, start: number, end: number): boolean {
  return frame >= start && frame <= end;
}

/**
 * Converts an absolute frame to a local frame within a sequence segment.
 * Useful in scene components when you want frame 0 = first frame of the scene.
 */
export function localFrame(absoluteFrame: number, sequenceStart: number): number {
  return Math.max(0, absoluteFrame - sequenceStart);
}

/**
 * Maps a 0–1 spring value to an opacity that fades in.
 */
export function fadeIn(springValue: number): number {
  return Math.min(1, springValue);
}

/**
 * Staggers: returns the delay in frames for the nth item.
 */
export function stagger(index: number, perItem: number, baseDelay = 0): number {
  return baseDelay + index * perItem;
}

/**
 * Word-split helper for word-drop animations.
 */
export function splitWords(text: string): string[] {
  return text.split(' ');
}
