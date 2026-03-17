import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { SectionTitle } from '../../components/SectionTitle';

const TIERS = [
  {
    name: 'Starter',
    price: 'Free',
    features: ['3 vendors', '5 docs', 'Gap analysis', 'Community support'],
    highlight: false,
  },
  {
    name: 'Professional',
    price: '€99',
    period: '/mo',
    features: ['50 vendors', 'Unlimited docs', 'AI Copilot', 'RoI export', 'Email alerts'],
    highlight: true,
  },
  {
    name: 'Business',
    price: '€299',
    period: '/mo',
    features: ['Unlimited vendors', 'Priority support', 'Custom integrations', 'SSO'],
    highlight: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    features: ['Dedicated instance', 'SLA', 'Onboarding', 'SIEM integration'],
    highlight: false,
  },
];

export function Scene08Pricing() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
        padding: '0 80px',
      }}
    >
      <SectionTitle title="Simple Pricing" delay={0} fontSize={FONT_SIZES.xl} />

      <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', width: '100%', maxWidth: 1200 }}>
        {TIERS.map((tier, i) => {
          const delay = i * 20;
          const translateY = computeSpring(frame, fps, delay, 'smooth', 28, 0);
          const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
          const ringPulse = tier.highlight ? 1 + Math.sin(frame * 0.1) * 0.02 : 1;

          return (
            <div
              key={tier.name}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                padding: '24px 20px',
                background: tier.highlight ? `${COLORS.blue}0d` : COLORS.surface,
                borderRadius: RADIUS.xl,
                border: tier.highlight
                  ? `2px solid ${COLORS.blue}`
                  : `1px solid ${COLORS.border}`,
                boxShadow: tier.highlight
                  ? `0 0 32px 8px ${COLORS.blueGlow}, ${SHADOWS.card}`
                  : SHADOWS.card,
                opacity,
                transform: `translateY(${translateY}px) scale(${ringPulse})`,
                position: 'relative',
              }}
            >
              {tier.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: COLORS.blue,
                    color: '#fff',
                    fontSize: FONT_SIZES.xs,
                    fontWeight: 700,
                    padding: '4px 14px',
                    borderRadius: RADIUS.full,
                    fontFamily: FONTS.sans,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Most Popular
                </div>
              )}

              <div>
                <div
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: FONT_SIZES.sm,
                    fontWeight: 600,
                    color: COLORS.textMuted,
                    marginBottom: 8,
                  }}
                >
                  {tier.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span
                    style={{
                      fontFamily: FONTS.sans,
                      fontSize: FONT_SIZES['2xl'],
                      fontWeight: 800,
                      color: tier.highlight ? COLORS.blue : COLORS.text,
                    }}
                  >
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span
                      style={{
                        fontFamily: FONTS.sans,
                        fontSize: FONT_SIZES.sm,
                        color: COLORS.textMuted,
                      }}
                    >
                      {tier.period}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {tier.features.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: COLORS.green, fontSize: 12 }}>✓</span>
                    <span
                      style={{
                        fontFamily: FONTS.sans,
                        fontSize: FONT_SIZES.xs,
                        color: COLORS.textMuted,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
