/**
 * Scene03GapAnalysis — 480–749f (9s)
 * Core feature showcase: ComplianceRing center + DORA article grid + domain bars.
 * Shows the "instant insight" value of automated gap analysis.
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { SectionTitle } from '../../components/SectionTitle';
import { GapBadge } from '../../components/GapBadge';
import { ComplianceRing } from '../../components/ComplianceRing';

const CLAUSES = [
  { article: 'Art. 5',  title: 'ICT Risk Governance',          status: 'covered'  as const },
  { article: 'Art. 8',  title: 'ICT Risk Management Framework', status: 'covered'  as const },
  { article: 'Art. 11', title: 'Business Continuity Planning',  status: 'partial'  as const },
  { article: 'Art. 13', title: 'Third-party Risk Controls',     status: 'covered'  as const },
  { article: 'Art. 17', title: 'Incident Classification',       status: 'partial'  as const },
  { article: 'Art. 19', title: 'Reporting to Authorities',      status: 'missing'  as const },
  { article: 'Art. 25', title: 'TLPT Programme',                status: 'covered'  as const },
  { article: 'Art. 28', title: 'Register of Information',       status: 'covered'  as const },
];

const DOMAINS = [
  { label: 'ICT Risk',       pct: 88, color: COLORS.blue },
  { label: 'Third-party',    pct: 74, color: COLORS.green },
  { label: 'Incidents',      pct: 63, color: COLORS.orange },
  { label: 'Testing (TLPT)', pct: 57, color: COLORS.purple },
  { label: 'Info Sharing',   pct: 91, color: COLORS.green },
];

const STATUS_COUNTS = { covered: 5, partial: 2, missing: 1 };

function DomainBar({ label, pct, color, delay }: { label: string; pct: number; color: string; delay: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w       = computeSpring(frame, fps, delay, 'smooth', 0, pct / 100);
  const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  return (
    <div style={{ opacity, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.textMuted }}>{label}</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color, fontWeight: 700 }}>{Math.round(w * pct)}%</span>
      </div>
      <div style={{ height: 8, background: COLORS.surfaceAlt, borderRadius: 99, overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
        <div style={{
          height: '100%',
          width: `${w * 100}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          borderRadius: 99,
          boxShadow: `0 0 10px 2px ${color}66`,
        }} />
      </div>
    </div>
  );
}

export function Scene03GapAnalysis() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const summaryO = computeSpring(frame, fps, 200, 'smooth', 0, 1);
  const summaryY = computeSpring(frame, fps, 200, 'smooth', 10, 0);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 32,
      padding: '32px 80px',
    }}>
      <SectionTitle
        title="Automated Gap Analysis"
        subline="AI maps your vendor documentation across all 28 DORA articles in minutes."
        accentWord="Gap Analysis"
        accentColor={COLORS.blue}
        delay={0}
        fontSize={FONT_SIZES.xl}
        align="center"
      />

      {/* Three-column layout */}
      <div style={{ display: 'flex', gap: 40, flex: 1, alignItems: 'center' }}>

        {/* ── Col 1: DORA article grid ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {CLAUSES.map((c, i) => {
            const delay = i * 22;
            const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);
            const x       = computeSpring(frame, fps, delay, 'smooth', -18, 0);
            return (
              <div
                key={c.article}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 14px',
                  background: COLORS.surface,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  opacity,
                  transform: `translateX(${x}px)`,
                }}
              >
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textDim, width: 54, flexShrink: 0 }}>{c.article}</span>
                <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.textMuted, flex: 1 }}>{c.title}</span>
                <GapBadge status={c.status} delay={delay + 6} />
              </div>
            );
          })}
        </div>

        {/* ── Col 2: Compliance ring ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <ComplianceRing
            value={78}
            size={220}
            strokeWidth={18}
            delay={40}
            color={COLORS.green}
            label="DORA Score"
            sublabel="Overall Coverage"
          />

          {/* Status summary */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              opacity: summaryO,
              transform: `translateY(${summaryY}px)`,
            }}
          >
            {[
              { label: 'Covered', count: STATUS_COUNTS.covered,  color: COLORS.green },
              { label: 'Partial',  count: STATUS_COUNTS.partial,   color: COLORS.orange },
              { label: 'Missing',  count: STATUS_COUNTS.missing,   color: COLORS.red },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FONTS.sans, fontSize: FONT_SIZES.xl, fontWeight: 800, color }}>{count}</div>
                <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.textMuted }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Time to insight badge */}
          <div style={{
            padding: '8px 18px',
            background: `${COLORS.blue}12`,
            border: `1px solid ${COLORS.blue}33`,
            borderRadius: RADIUS.full,
            opacity: computeSpring(frame, fps, 120, 'smooth', 0, 1),
          }}>
            <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.blue, fontWeight: 600 }}>
              ⚡ Analysis complete in &lt; 2 minutes
            </span>
          </div>
        </div>

        {/* ── Col 3: Domain coverage bars ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          <span style={{
            fontFamily: FONTS.sans,
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            opacity: computeSpring(frame, fps, 60, 'smooth', 0, 1),
          }}>
            Coverage by DORA Domain
          </span>
          {DOMAINS.map((d, i) => (
            <DomainBar key={d.label} {...d} delay={60 + i * 18} />
          ))}

          {/* EBA export nudge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: `${COLORS.green}0a`,
            border: `1px solid ${COLORS.green}30`,
            borderRadius: RADIUS.md,
            marginTop: 8,
            opacity: computeSpring(frame, fps, 180, 'smooth', 0, 1),
          }}>
            <span style={{ fontSize: 16 }}>📋</span>
            <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.textMuted }}>
              Export EBA Art. 28(3) RoI — one click
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.green, fontWeight: 700, marginLeft: 'auto' }}>XLSX ↓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
