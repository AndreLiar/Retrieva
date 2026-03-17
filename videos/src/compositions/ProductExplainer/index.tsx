import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { Scene00Intro } from './Scene00Intro';
import { Scene01Problem } from './Scene01Problem';
import { Scene02HowItWorks } from './Scene02HowItWorks';
import { Scene03GapAnalysis } from './Scene03GapAnalysis';
import { Scene04Copilot } from './Scene04Copilot';
import { Scene05Register } from './Scene05Register';
import { Scene06Alerts } from './Scene06Alerts';
import { Scene07Security } from './Scene07Security';
import { Scene08Pricing } from './Scene08Pricing';
import { Scene09CTA } from './Scene09CTA';

// Scene timing (frames @ 30fps)
// Scene00 Intro:        0  → 150  (5s)
// Scene01 Problem:    150  → 330  (6s)
// Scene02 HowItWorks: 330  → 600  (9s)
// Scene03 GapAnalysis:600  → 870  (9s)
// Scene04 Copilot:    870  → 1110 (8s)
// Scene05 Register:  1110  → 1290 (6s)
// Scene06 Alerts:    1290  → 1470 (6s)
// Scene07 Security:  1470  → 1650 (6s)
// Scene08 Pricing:   1650  → 1830 (6s)
// Scene09 CTA:       1830  → 2430 (20s)
// Total: 2430 frames = 81s

export function ProductExplainer() {
  const { durationInFrames } = useVideoConfig();

  return (
    <Background variant="gradient">
      <GridLines opacity={0.03} />

      {/* Ambient background audio — fades in over 3s, fades out over 4s at end */}
      <Audio
        src={staticFile('audio/bg.mp3')}
        volume={(f) => {
          const fadeInEnd = 90;   // 3s fade in
          const fadeOutStart = durationInFrames - 120; // start fade 4s before end
          if (f < fadeInEnd) return (f / fadeInEnd) * 0.35;
          if (f > fadeOutStart) return ((durationInFrames - f) / 120) * 0.35;
          return 0.35;
        }}
      />

      <Sequence from={0} durationInFrames={150}>
        <Scene00Intro />
      </Sequence>

      <Sequence from={150} durationInFrames={180}>
        <Scene01Problem />
      </Sequence>

      <Sequence from={330} durationInFrames={270}>
        <Scene02HowItWorks />
      </Sequence>

      <Sequence from={600} durationInFrames={270}>
        <Scene03GapAnalysis />
      </Sequence>

      <Sequence from={870} durationInFrames={240}>
        <Scene04Copilot />
      </Sequence>

      <Sequence from={1110} durationInFrames={180}>
        <Scene05Register />
      </Sequence>

      <Sequence from={1290} durationInFrames={180}>
        <Scene06Alerts />
      </Sequence>

      <Sequence from={1470} durationInFrames={180}>
        <Scene07Security />
      </Sequence>

      <Sequence from={1650} durationInFrames={180}>
        <Scene08Pricing />
      </Sequence>

      <Sequence from={1830} durationInFrames={600}>
        <Scene09CTA />
      </Sequence>
    </Background>
  );
}
