import React from 'react';
import { Background } from '../../components/Background';
import { LowerThirdSequence } from './LowerThirdSequence';
import { CalloutSequence } from './CalloutSequence';

/**
 * DemoOverlay — 900f = 30s, 1920×1080
 * Rendered as transparent WebM (vp8 codec, no background).
 * Intended to be composited over a screen recording.
 */
export function DemoOverlay() {
  return (
    <Background transparent>
      {/* Lower-third text strips */}
      <LowerThirdSequence />

      {/* Pulsing callout annotations */}
      <CalloutSequence />
    </Background>
  );
}
