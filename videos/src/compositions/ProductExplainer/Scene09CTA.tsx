/**
 * Scene09CTA — 1710–2699f (33s)
 * "Start compliant. Stay compliant." — ROI framing, proof stats, dramatic fade.
 * Final conversion moment.
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';

// Flowing particle field — two-tone blue/green
function ParticleField() {
  const frame = useCurrentFrame();
  const cols = 28;
  const rows = 16;
  const items: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const phase  = (r * cols + c) * 0.41;
      const wave   = Math.sin(frame * 0.04 + phase);
      const color  = (r + c) % 3 === 0 ? COLORS.green : COLORS.blue;
      const size   = ((wave + 1) / 2) * 2.5 + 1;
      const op     = ((wave + 1) / 2) * 0.18 + 0.02;
      items.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: `${(c / (cols - 1)) * 100}%`,
            top:  `${(r / (rows - 1)) * 100}%`,
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            opacity: op,
            transform: `translate(-50%, -50%)`,
          }}
        />,
      );
    }
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {items}
    </div>
  );
}

// Horizontal scan line that moves slowly upward
function ScanLine() {
  const frame = useCurrentFrame();
  const pos = ((frame * 0.3) % 100);
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${pos}%`,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${COLORS.blue}22, ${COLORS.green}22, transparent)`,
      }} />
    </div>
  );
}

const PROOF_STATS = [
  { value: '€0',   label: 'Regulatory penalties', color: COLORS.green },
  { value: '48h',  label: 'To first gap report',   color: COLORS.blue },
  { value: '95%',  label: 'Less manual work',       color: COLORS.purple },
  { value: '100%', label: 'EBA-ready export',       color: COLORS.green },
];

export function Scene09CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineO = computeSpring(frame, fps, 0,  'smooth', 0, 1);
  const headlineY = computeSpring(frame, fps, 0,  'smooth', 28, 0);
  const subO      = computeSpring(frame, fps, 18, 'smooth', 0, 1);
  const statsO    = computeSpring(frame, fps, 35, 'smooth', 0, 1);
  const statsY    = computeSpring(frame, fps, 35, 'smooth', 16, 0);
  const urlO      = computeSpring(frame, fps, 55, 'smooth', 0, 1);
  const urlScale  = computeSpring(frame, fps, 55, 'bounce',  0.85, 1);
  const badgesO   = computeSpring(frame, fps, 72, 'smooth', 0, 1);

  const fadeBlack = ic(frame, [930, 989], [0, 1]);
  const cursorBlink = Math.round(frame / 15) % 2 === 0 ? 1 : 0;

  // Pulsing glow on the URL box
  const urlGlow = `0 0 ${40 + Math.sin(frame * 0.1) * 12}px ${COLORS.blueGlow}`;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      position: 'relative',
    }}>
      <ParticleField />
      <ScanLine />

      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 36,
        maxWidth: 900,
        width: '100%',
        padding: '0 60px',
      }}>

        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: headlineO }}>
          <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={COLORS.blue} strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${COLORS.blue}18`} />
            <polyline points="9 12 11 14 15 10" strokeWidth="2.5" stroke={COLORS.green} />
          </svg>
          <span style={{ fontFamily: FONTS.sans, fontSize: FONT_SIZES.lg, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em' }}>Retrieva</span>
        </div>

        {/* Main headline */}
        <div style={{ opacity: headlineO, transform: `translateY(${headlineY}px)`, textAlign: 'center' }}>
          <h2 style={{
            fontFamily: FONTS.sans,
            fontSize: FONT_SIZES['3xl'],
            fontWeight: 800,
            color: COLORS.text,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            margin: 0,
          }}>
            Start compliant.{' '}
            <span style={{ color: COLORS.blue, textShadow: `0 0 40px ${COLORS.blueGlow}` }}>
              Stay compliant.
            </span>
          </h2>
        </div>

        {/* Sub */}
        <p style={{
          fontFamily: FONTS.sans,
          fontSize: FONT_SIZES.md,
          color: COLORS.textMuted,
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.5,
          opacity: subO,
        }}>
          Trusted by compliance teams at 200+ financial entities across the EU.
          <br />
          No infrastructure. No consultants. Just results.
        </p>

        {/* Proof stats row */}
        <div style={{
          display: 'flex',
          gap: 20,
          opacity: statsO,
          transform: `translateY(${statsY}px)`,
        }}>
          {PROOF_STATS.map((s, i) => {
            const itemScale = computeSpring(frame, fps, 35 + i * 8, 'bounce', 0.8, 1);
            return (
              <div
                key={s.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '18px 28px',
                  background: `${s.color}0a`,
                  border: `1px solid ${s.color}30`,
                  borderRadius: RADIUS.xl,
                  transform: `scale(${itemScale})`,
                  minWidth: 140,
                }}
              >
                <span style={{
                  fontFamily: FONTS.sans,
                  fontSize: FONT_SIZES['2xl'],
                  fontWeight: 800,
                  color: s.color,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                }}>
                  {s.value}
                </span>
                <span style={{
                  fontFamily: FONTS.sans,
                  fontSize: 12,
                  color: COLORS.textMuted,
                  textAlign: 'center',
                  fontWeight: 500,
                }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* URL box */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '16px 36px',
          background: `${COLORS.blue}12`,
          border: `1.5px solid ${COLORS.blue}55`,
          borderRadius: RADIUS.xl,
          opacity: urlO,
          transform: `scale(${urlScale})`,
          boxShadow: urlGlow,
        }}>
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZES['2xl'],
            fontWeight: 700,
            color: COLORS.blue,
            letterSpacing: '0.01em',
          }}>
            retrieva.online
          </span>
          <span style={{
            display: 'inline-block',
            width: '0.5em',
            height: '1.1em',
            background: COLORS.blue,
            marginLeft: 4,
            verticalAlign: 'text-bottom',
            opacity: cursorBlink,
          }} />
        </div>

        {/* Trust badges */}
        <div style={{
          display: 'flex',
          gap: 16,
          opacity: badgesO,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {[
            { text: 'Free to start', color: COLORS.green },
            { text: 'DORA Art. 28(3) ready', color: COLORS.blue },
            { text: 'EBA RTS compliant', color: COLORS.blue },
            { text: 'No credit card', color: COLORS.textMuted },
          ].map(({ text, color }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
              <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: COLORS.textMuted }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fade to black */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        opacity: fadeBlack,
        pointerEvents: 'none',
      }} />
    </div>
  );
}
