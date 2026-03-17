/**
 * Scene01Problem — 90–209f (4s)
 * "Compliance teams are drowning." — Pain cards + penalty callout.
 * Emotional contrast: manual chaos → regulatory consequence.
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';

const PAINS = [
  {
    icon: '📊',
    color: COLORS.orange,
    title: 'Spreadsheet chaos',
    desc: '50+ vendor tabs. One update cascades into broken formulas and missing clauses.',
    stat: '3–8 weeks per cycle',
  },
  {
    icon: '📧',
    color: COLORS.orange,
    title: 'Vendor questionnaires by email',
    desc: 'Chasing responses for months. No audit trail. No scoring. No version control.',
    stat: '60% response rate',
  },
  {
    icon: '🚨',
    color: COLORS.red,
    title: 'Regulatory exposure',
    desc: 'Missing a single gap analysis can trigger enforcement action from your NCA.',
    stat: 'Up to €10M fine',
    highlight: true,
  },
];

export function Scene01Problem() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineY = computeSpring(frame, fps, 0, 'smooth', 20, 0);
  const headlineO = computeSpring(frame, fps, 0, 'smooth', 0, 1);

  // Pulsing glow for penalty card
  const pulse = 0.7 + Math.sin(frame * 0.18) * 0.3;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 40,
      padding: '0 96px',
    }}>

      {/* Headline */}
      <div style={{ textAlign: 'center', opacity: headlineO, transform: `translateY(${headlineY}px)` }}>
        <h2 style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES['2xl'],
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: '-0.03em',
          margin: 0,
        }}>
          Compliance teams are{' '}
          <span style={{ color: COLORS.orange }}>drowning</span> in manual work.
        </h2>
        <p style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.md,
          color: COLORS.textMuted,
          margin: '10px 0 0',
        }}>
          And regulators are not waiting.
        </p>
      </div>

      {/* Pain cards */}
      <div style={{ display: 'flex', gap: 24, width: '100%' }}>
        {PAINS.map((pain, i) => {
          const delay = 20 + i * 28;
          const cardY = computeSpring(frame, fps, delay, 'smooth', 30, 0);
          const cardO = computeSpring(frame, fps, delay, 'smooth', 0, 1);
          const isHighlight = pain.highlight;

          return (
            <div
              key={pain.title}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                padding: '24px 22px',
                background: isHighlight ? `${COLORS.red}0a` : COLORS.surface,
                borderRadius: RADIUS.xl,
                border: `1px solid ${isHighlight ? COLORS.red : COLORS.border}`,
                borderTop: `3px solid ${pain.color}`,
                boxShadow: isHighlight
                  ? `0 0 ${32 * pulse}px ${12 * pulse}px ${COLORS.red}22, ${SHADOWS.card}`
                  : SHADOWS.card,
                opacity: cardO,
                transform: `translateY(${cardY}px)`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{pain.icon}</span>
                <span style={{
                  fontFamily: FONTS.sans,
                  fontSize: FONT_SIZES.base,
                  fontWeight: 700,
                  color: COLORS.text,
                }}>
                  {pain.title}
                </span>
              </div>

              <p style={{
                fontFamily: FONTS.sans,
                fontSize: FONT_SIZES.sm,
                color: COLORS.textMuted,
                lineHeight: 1.55,
                margin: 0,
                flex: 1,
              }}>
                {pain.desc}
              </p>

              {/* Stat badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: `${pain.color}15`,
                borderRadius: RADIUS.full,
                border: `1px solid ${pain.color}44`,
                alignSelf: 'flex-start',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: pain.color, boxShadow: `0 0 6px ${pain.color}` }} />
                <span style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  color: pain.color,
                  fontWeight: 700,
                }}>
                  {pain.stat}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* DORA enforcement banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 24px',
        background: `${COLORS.orange}08`,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.orange}30`,
        width: '100%',
        opacity: computeSpring(frame, fps, 90, 'smooth', 0, 1),
        transform: `translateY(${computeSpring(frame, fps, 90, 'smooth', 12, 0)}px)`,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⚖️</span>
        <span style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.textMuted, lineHeight: 1.5 }}>
          <span style={{ color: COLORS.orange, fontWeight: 700 }}>DORA Regulation Art. 2</span>
          {' '}— Supervisory penalties of up to{' '}
          <span style={{ color: COLORS.red, fontWeight: 700 }}>€10,000,000</span>
          {' '}or <span style={{ color: COLORS.red, fontWeight: 700 }}>2% of annual worldwide turnover</span>
          {' '}for significant compliance failures. Applicable since{' '}
          <span style={{ color: COLORS.text, fontWeight: 600 }}>17 January 2025</span>.
        </span>
      </div>
    </div>
  );
}
