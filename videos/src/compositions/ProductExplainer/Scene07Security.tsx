import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { SectionTitle } from '../../components/SectionTitle';
import { Badge } from '../../components/Badge';

const PILLARS = [
  { icon: '🔒', title: 'Workspace Isolation', sub: 'Strict multi-tenant data separation' },
  { icon: '🕵️', title: 'PII Detection', sub: 'Automatic redaction before indexing' },
  { icon: '📋', title: 'Audit Logging', sub: 'Full immutable activity trail' },
  { icon: '🗝️', title: 'Encrypted Secrets', sub: 'SOPS + age key management' },
];

export function Scene07Security() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Shield pulse
  const shieldScale = 1 + Math.sin(frame * 0.12) * 0.04;
  const shieldGlow = `0 0 ${32 + Math.sin(frame * 0.12) * 12}px ${COLORS.greenGlow}`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        padding: '0 100px',
      }}
    >
      <SectionTitle
        title="Enterprise-Grade Security"
        accentWord="Security"
        accentColor={COLORS.green}
        delay={0}
        fontSize={FONT_SIZES.xl}
      />

      <div style={{ display: 'flex', gap: 80, alignItems: 'center' }}>
        {/* Shield */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              transform: `scale(${shieldScale})`,
              filter: `drop-shadow(${shieldGlow})`,
            }}
          >
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke={COLORS.green} strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${COLORS.green}1a`} />
              <polyline points="9 12 11 14 15 10" strokeWidth="2" />
            </svg>
          </div>
          <Badge text="SOC 2 Ready" color={COLORS.green} delay={20} />
        </div>

        {/* 2×2 pillar grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
          }}
        >
          {PILLARS.map((pillar, i) => {
            const delay = i * 30;
            const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
            const y = computeSpring(frame, fps, delay, 'smooth', 20, 0);

            return (
              <div
                key={pillar.title}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: '20px 24px',
                  background: COLORS.surface,
                  borderRadius: RADIUS.lg,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow: SHADOWS.card,
                  opacity,
                  transform: `translateY(${y}px)`,
                  width: 240,
                }}
              >
                <span style={{ fontSize: 28 }}>{pillar.icon}</span>
                <div>
                  <div
                    style={{
                      fontFamily: FONTS.sans,
                      fontSize: FONT_SIZES.base,
                      fontWeight: 600,
                      color: COLORS.text,
                      marginBottom: 4,
                    }}
                  >
                    {pillar.title}
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.sans,
                      fontSize: FONT_SIZES.sm,
                      color: COLORS.textMuted,
                    }}
                  >
                    {pillar.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
