/**
 * SocialCut — 450f / 15s, 1080×1920 portrait (9:16 LinkedIn/Reels)
 *
 * Story arc:
 *   0–89f   Hook:    "DORA deadline passed. Are you compliant?"
 *  90–179f  Proof:   Compliance ring animating to 78% + 3 domain bars
 * 180–299f  Features: 3 feature pills slide in one by one
 * 300–389f  Stats:   3 animated counters
 * 390–449f  CTA:     URL + fade to black
 */
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { ComplianceRing } from '../../components/ComplianceRing';
import { GlowBar } from '../../components/GlowBar';

// ─── Segment 0–89: Hook ──────────────────────────────────────────────────────
function HookSegment() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line1O = computeSpring(frame, fps, 0,  'smooth', 0, 1);
  const line1Y = computeSpring(frame, fps, 0,  'bounce', 40, 0);
  const line2O = computeSpring(frame, fps, 18, 'smooth', 0, 1);
  const line2Y = computeSpring(frame, fps, 18, 'bounce', 40, 0);
  const badgeO = computeSpring(frame, fps, 36, 'smooth', 0, 1);

  // Pulsing red warning dot
  const dotPulse = 1 + Math.sin(frame * 0.3) * 0.4;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 80px',
      gap: 32,
    }}>
      {/* Shield logo */}
      <div style={{ opacity: computeSpring(frame, fps, 0, 'bounce', 0, 1) }}>
        <svg width={72} height={72} viewBox="0 0 24 24" fill="none" stroke={COLORS.blue} strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${COLORS.blue}18`} />
          <polyline points="9 12 11 14 15 10" strokeWidth="2.5" stroke={COLORS.green} />
        </svg>
      </div>

      {/* Hook lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: FONTS.sans,
          fontSize: 72,
          fontWeight: 900,
          color: COLORS.text,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          margin: 0,
          opacity: line1O,
          transform: `translateY(${line1Y}px)`,
        }}>
          DORA
          <br />
          <span style={{ color: COLORS.orange }}>deadline</span>
          <br />
          passed.
        </h1>
        <h2 style={{
          fontFamily: FONTS.sans,
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.textMuted,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          margin: 0,
          opacity: line2O,
          transform: `translateY(${line2Y}px)`,
        }}>
          Is your ICT risk register
          <br />
          ready for regulators?
        </h2>
      </div>

      {/* Warning badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        background: `${COLORS.red}10`,
        border: `1px solid ${COLORS.red}44`,
        borderRadius: RADIUS.full,
        opacity: badgeO,
      }}>
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: COLORS.red,
          boxShadow: `0 0 ${8 * dotPulse}px ${COLORS.red}`,
          transform: `scale(${dotPulse})`,
        }} />
        <span style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.red, fontWeight: 700 }}>
          Up to €10M in fines
        </span>
      </div>
    </div>
  );
}

// ─── Segment 90–179: Proof ───────────────────────────────────────────────────
function ProofSegment() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleO = computeSpring(frame, fps, 0, 'smooth', 0, 1);

  const DOMAINS = [
    { label: 'ICT Risk Management', pct: 88, color: COLORS.blue },
    { label: 'Third-party Risk',    pct: 74, color: COLORS.green },
    { label: 'Incident Reporting',  pct: 63, color: COLORS.orange },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 80px',
      gap: 48,
    }}>
      <div style={{ opacity: titleO, textAlign: 'center' }}>
        <p style={{ fontFamily: FONTS.sans, fontSize: 22, color: COLORS.textMuted, margin: 0 }}>
          Retrieva shows you exactly
        </p>
        <h2 style={{ fontFamily: FONTS.sans, fontSize: 44, fontWeight: 800, color: COLORS.text, letterSpacing: '-0.03em', margin: '6px 0 0' }}>
          where you stand.
        </h2>
      </div>

      <ComplianceRing
        value={78}
        size={280}
        strokeWidth={22}
        delay={10}
        color={COLORS.green}
        label="DORA Score"
        sublabel="Auto-calculated"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
        {DOMAINS.map((d, i) => (
          <GlowBar
            key={d.label}
            value={d.pct}
            label={d.label}
            color={d.color}
            delay={20 + i * 15}
            width={920}
            height={10}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Segment 180–299: Feature pills ──────────────────────────────────────────
function FeaturesSegment() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const FEATURES = [
    { icon: '🔍', title: 'Automated Gap Analysis',      sub: 'AI maps your docs to all 28 DORA articles', color: COLORS.blue,   delay: 0  },
    { icon: '🤖', title: 'AI Copilot',                  sub: 'Ask compliance questions in plain language',  color: COLORS.green,  delay: 30 },
    { icon: '📋', title: 'EBA Register of Information', sub: 'Art. 28(3) XLSX export — one click',          color: COLORS.purple, delay: 60 },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 60px',
      gap: 28,
    }}>
      <div style={{ opacity: computeSpring(frame, fps, 0, 'smooth', 0, 1), textAlign: 'center' }}>
        <h2 style={{ fontFamily: FONTS.sans, fontSize: 48, fontWeight: 800, color: COLORS.text, letterSpacing: '-0.03em', margin: 0 }}>
          Everything you need.
        </h2>
        <p style={{ fontFamily: FONTS.sans, fontSize: 22, color: COLORS.textMuted, margin: '8px 0 0' }}>
          Nothing you don't.
        </p>
      </div>

      {FEATURES.map((f) => {
        const x = computeSpring(frame, fps, f.delay, 'snappy', 80, 0);
        const o = computeSpring(frame, fps, f.delay, 'smooth', 0, 1);
        return (
          <div
            key={f.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '20px 28px',
              background: `${f.color}0d`,
              border: `1px solid ${f.color}33`,
              borderRadius: RADIUS.xl,
              width: '100%',
              opacity: o,
              transform: `translateX(${x}px)`,
            }}
          >
            <span style={{ fontSize: 36, flexShrink: 0 }}>{f.icon}</span>
            <div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 22, fontWeight: 700, color: f.color, marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.textMuted }}>{f.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segment 300–389: Stats ───────────────────────────────────────────────────
function StatsSegment() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const STATS = [
    { value: 150, suffix: '+', label: 'Vendors managed',    color: COLORS.blue,   delay: 0  },
    { value: 28,  suffix: '',  label: 'DORA articles',       color: COLORS.green,  delay: 15 },
    { value: 48,  suffix: 'h', label: 'To first gap report', color: COLORS.purple, delay: 30 },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 60px',
      gap: 48,
    }}>
      <div style={{ opacity: computeSpring(frame, fps, 0, 'smooth', 0, 1), textAlign: 'center' }}>
        <h2 style={{ fontFamily: FONTS.sans, fontSize: 48, fontWeight: 800, color: COLORS.text, letterSpacing: '-0.03em', margin: 0 }}>
          By the numbers.
        </h2>
      </div>

      {STATS.map((s) => {
        const prog  = computeSpring(frame, fps, s.delay, 'smooth', 0, 1);
        const scale = computeSpring(frame, fps, s.delay, 'bounce', 0.7, 1);
        return (
          <div
            key={s.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              opacity: prog,
              transform: `scale(${scale})`,
            }}
          >
            <span style={{
              fontFamily: FONTS.sans,
              fontSize: 96,
              fontWeight: 900,
              color: s.color,
              letterSpacing: '-0.05em',
              lineHeight: 1,
              textShadow: `0 0 40px ${s.color}66`,
            }}>
              {Math.round(prog * s.value)}{s.suffix}
            </span>
            <span style={{ fontFamily: FONTS.sans, fontSize: 22, color: COLORS.textMuted, fontWeight: 500 }}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segment 390–449: CTA ────────────────────────────────────────────────────
function CTASegment() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const o          = computeSpring(frame, fps, 0,  'smooth', 0, 1);
  const urlScale   = computeSpring(frame, fps, 10, 'bounce', 0.8, 1);
  const fadeBlack  = ic(frame, [30, 59], [0, 1]);
  const cursorBlink = Math.round(frame / 15) % 2 === 0 ? 1 : 0;
  const urlGlow    = `0 0 ${32 + Math.sin(frame * 0.15) * 10}px ${COLORS.blueGlow}`;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 80px',
      gap: 32,
      opacity: o,
      position: 'relative',
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: FONTS.sans, fontSize: 26, color: COLORS.textMuted, margin: '0 0 8px' }}>
          Start your free trial at
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 40px',
          background: `${COLORS.blue}12`,
          border: `2px solid ${COLORS.blue}55`,
          borderRadius: RADIUS.xl,
          boxShadow: urlGlow,
          transform: `scale(${urlScale})`,
        }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 52, fontWeight: 700, color: COLORS.blue, letterSpacing: '-0.01em' }}>
            retrieva
          </span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 52, fontWeight: 700, color: COLORS.textMuted }}>
            .online
          </span>
          <span style={{
            display: 'inline-block',
            width: '0.45em',
            height: '0.9em',
            background: COLORS.blue,
            marginLeft: 6,
            verticalAlign: 'text-bottom',
            opacity: cursorBlink,
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Free to start', 'No credit card', 'EBA-ready'].map((t) => (
          <div key={t} style={{
            padding: '8px 18px',
            background: `${COLORS.green}0d`,
            border: `1px solid ${COLORS.green}33`,
            borderRadius: RADIUS.full,
          }}>
            <span style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.green, fontWeight: 600 }}>✓ {t}</span>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fadeBlack, pointerEvents: 'none' }} />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export function SocialCut() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} spacing={80} />
      <Sequence from={0}   durationInFrames={90}><HookSegment /></Sequence>
      <Sequence from={90}  durationInFrames={90}><ProofSegment /></Sequence>
      <Sequence from={180} durationInFrames={120}><FeaturesSegment /></Sequence>
      <Sequence from={300} durationInFrames={90}><StatsSegment /></Sequence>
      <Sequence from={390} durationInFrames={60}><CTASegment /></Sequence>
    </Background>
  );
}
