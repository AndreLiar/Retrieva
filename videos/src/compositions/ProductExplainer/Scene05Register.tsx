import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { SectionTitle } from '../../components/SectionTitle';
import { MetricCounter } from '../../components/MetricCounter';

const ROWS = [
  ['Acme Corp', 'ICT Provider', 'Critical', 'Active', '2025-12'],
  ['Beta Systems', 'Cloud Storage', 'Important', 'Active', '2025-06'],
  ['Gamma SaaS', 'SaaS Platform', 'Important', 'Review', '2024-12'],
  ['Delta Infra', 'Data Centre', 'Critical', 'Active', '2026-03'],
];
const HEADERS = ['Vendor', 'Type', 'Criticality', 'Status', 'Renewal'];

export function Scene05Register() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tableOpacity = computeSpring(frame, fps, 0, 'smooth', 0, 1);

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
        title="Register of Information"
        accentWord="Register"
        accentColor={COLORS.green}
        delay={0}
        fontSize={FONT_SIZES.xl}
        subline="EBA Art. 28(3) compliant — XLSX export in one click"
      />

      {/* Mini spreadsheet */}
      <div
        style={{
          opacity: tableOpacity,
          width: '100%',
          maxWidth: 900,
          background: COLORS.surface,
          borderRadius: RADIUS.lg,
          border: `1px solid ${COLORS.border}`,
          boxShadow: SHADOWS.card,
          overflow: 'hidden',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1fr',
            background: COLORS.surfaceAlt,
            borderBottom: `1px solid ${COLORS.border}`,
            padding: '10px 20px',
            gap: 16,
          }}
        >
          {HEADERS.map((h) => (
            <span
              key={h}
              style={{
                fontFamily: FONTS.sans,
                fontSize: FONT_SIZES.xs,
                fontWeight: 600,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Data rows */}
        {ROWS.map((row, i) => {
          const rowOpacity = computeSpring(frame, fps, i * 20 + 16, 'smooth', 0, 1);
          return (
            <div
              key={row[0]}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1fr',
                padding: '12px 20px',
                gap: 16,
                borderBottom: i < ROWS.length - 1 ? `1px solid ${COLORS.borderSubtle}` : 'none',
                opacity: rowOpacity,
              }}
            >
              {row.map((cell, ci) => (
                <span
                  key={ci}
                  style={{
                    fontFamily: ci === 0 ? FONTS.sans : FONTS.mono,
                    fontSize: FONT_SIZES.xs,
                    color:
                      cell === 'Critical'
                        ? COLORS.orange
                        : cell === 'Review'
                          ? COLORS.orange
                          : cell === 'Active'
                            ? COLORS.green
                            : COLORS.textMuted,
                    fontWeight: ci === 0 ? 500 : 400,
                  }}
                >
                  {cell}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {/* Counters */}
      <div style={{ display: 'flex', gap: 80 }}>
        <MetricCounter value={150} suffix="+" label="Vendors tracked" delay={40} color={COLORS.blue} fontSize={FONT_SIZES['2xl']} />
        <MetricCounter value={4} label="EBA RoI sheets" delay={50} color={COLORS.green} fontSize={FONT_SIZES['2xl']} />
        <MetricCounter value={1} label="Click to export" delay={60} color={COLORS.purple} fontSize={FONT_SIZES['2xl']} />
      </div>
    </div>
  );
}
