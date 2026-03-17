/**
 * Scene00Intro — 0–89f (3s)
 * Split layout: Left = animated compliance ring + domain bars
 *               Right = logo + regulation badge + tagline + stat pills
 * Establishes authority and product identity immediately.
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { Logo } from '../../components/Logo';
import { Badge } from '../../components/Badge';
import { ComplianceRing } from '../../components/ComplianceRing';
import { StatPill } from '../../components/StatPill';

const DOMAINS = [
  { label: 'ICT Risk Management',   pct: 88, color: COLORS.blue },
  { label: 'Third-party Risk',      pct: 74, color: COLORS.green },
  { label: 'Incident Reporting',    pct: 67, color: COLORS.orange },
  { label: 'TLPT / Testing',        pct: 58, color: COLORS.purple },
  { label: 'Information Sharing',   pct: 92, color: COLORS.green },
];

function DomainBar({ label, pct, color, delay }: { label: string; pct: number; color: string; delay: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w       = computeSpring(frame, fps, delay, 'smooth', 0, pct / 100);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  return (
    <div style={{ opacity, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.textMuted }}>{label}</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color, fontWeight: 600 }}>{Math.round(w * pct)}%</span>
      </div>
      <div style={{ height: 6, background: COLORS.surfaceAlt, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${w * 100}%`,
          background: color,
          borderRadius: 99,
          boxShadow: `0 0 8px 1px ${color}88`,
        }} />
      </div>
    </div>
  );
}

export function Scene00Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftOpacity  = computeSpring(frame, fps, 0,  'smooth', 0, 1);
  const rightY       = computeSpring(frame, fps, 8,  'smooth', 20, 0);
  const rightOpacity = computeSpring(frame, fps, 8,  'smooth', 0, 1);
  const dividerScale = computeSpring(frame, fps, 12, 'smooth', 0, 1);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      padding: '0 96px',
      gap: 80,
    }}>

      {/* ── LEFT: Ring + domain bars ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        opacity: leftOpacity,
        flexShrink: 0,
      }}>
        <ComplianceRing
          value={76}
          size={260}
          strokeWidth={20}
          delay={0}
          color={COLORS.green}
          label="Overall Score"
          sublabel="DORA Coverage"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
          {DOMAINS.map((d, i) => (
            <DomainBar key={d.label} {...d} delay={20 + i * 10} />
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{
        width: 1,
        height: 400,
        background: `linear-gradient(to bottom, transparent, ${COLORS.border}, transparent)`,
        transform: `scaleY(${dividerScale})`,
        flexShrink: 0,
      }} />

      {/* ── RIGHT: Brand + stats ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        flex: 1,
        opacity: rightOpacity,
        transform: `translateY(${rightY}px)`,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={COLORS.blue} strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${COLORS.blue}18`} />
            <polyline points="9 12 11 14 15 10" strokeWidth="2.5" stroke={COLORS.green} />
          </svg>
          <span style={{ fontFamily: FONTS.sans, fontSize: FONT_SIZES['2xl'], fontWeight: 800, color: COLORS.text, letterSpacing: '-0.03em' }}>
            Retrieva
          </span>
        </div>

        {/* Tagline */}
        <div>
          <h1 style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES['3xl'],
            fontWeight: 800,
            color: COLORS.text,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            margin: 0,
          }}>
            DORA Compliance{' '}
            <span style={{ color: COLORS.blue }}>Intelligence</span>
          </h1>
          <p style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES.md,
            color: COLORS.textMuted,
            margin: '12px 0 0',
            lineHeight: 1.5,
          }}>
            Built for financial entities. Ready for regulators.
          </p>
        </div>

        {/* Regulation badge */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Badge text="DORA (EU) 2022/2554" color={COLORS.blue} delay={18} />
          <Badge text="EBA RTS Compliant" color={COLORS.green} delay={24} />
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 16 }}>
          <StatPill value="&lt; 48h"  label="First gap report"  delay={30} color={COLORS.blue} />
          <StatPill value="150+"  label="Vendors managed"  delay={38} color={COLORS.green} />
          <StatPill value="28"    label="DORA articles"    delay={46} color={COLORS.purple} />
        </div>

        {/* EU regulation citation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: `${COLORS.orange}0d`,
          border: `1px solid ${COLORS.orange}33`,
          borderRadius: RADIUS.lg,
          opacity: computeSpring(frame, fps, 55, 'smooth', 0, 1),
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.textMuted, lineHeight: 1.4 }}>
            <span style={{ color: COLORS.orange, fontWeight: 600 }}>DORA Art. 2 </span>
            — applicable to 22,000+ financial entities since{' '}
            <span style={{ color: COLORS.text, fontWeight: 600 }}>January 17, 2025</span>
          </span>
        </div>
      </div>
    </div>
  );
}
