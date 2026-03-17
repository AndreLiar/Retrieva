import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../../lib/brand';
import { LowerThird } from '../../components/LowerThird';

const LOWER_THIRDS = [
  {
    from: 30,
    duration: 150,
    title: 'Uploading ICT vendor documentation',
    subtitle: 'PDF, DOCX, XLSX — parsed and chunked automatically',
    color: COLORS.blue,
  },
  {
    from: 210,
    duration: 150,
    title: 'Running DORA gap analysis',
    subtitle: 'AI maps coverage across all 28 DORA articles',
    color: COLORS.green,
  },
  {
    from: 390,
    duration: 150,
    title: 'Sending vendor questionnaire',
    subtitle: 'LLM scores responses in seconds, not weeks',
    color: COLORS.purple,
  },
  {
    from: 570,
    duration: 150,
    title: 'Monitoring compliance deadlines',
    subtitle: '90 / 30 / 7-day alerts for certs and renewals',
    color: COLORS.orange,
  },
  {
    from: 750,
    duration: 150,
    title: 'Exporting EBA Register of Information',
    subtitle: 'Art. 28(3) XLSX — ready for regulators',
    color: COLORS.green,
  },
];

export function LowerThirdSequence() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {LOWER_THIRDS.map((lt) => (
        <Sequence key={lt.from} from={lt.from} durationInFrames={lt.duration}>
          <div
            style={{
              position: 'absolute',
              bottom: 80,
              left: 60,
            }}
          >
            <LowerThird
              title={lt.title}
              subtitle={lt.subtitle}
              frame={frame - lt.from}
              fps={fps}
              delay={0}
              color={lt.color}
            />
          </div>
        </Sequence>
      ))}
    </>
  );
}
