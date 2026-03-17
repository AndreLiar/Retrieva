/**
 * FeatureSpotlight — Vendor Questionnaires
 * 750f / 25s, 1920×1080
 * Story: Replace 3-8 week email chains with LLM-scored questionnaires in minutes.
 */
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { Logo } from '../../components/Logo';
import { GlowBar } from '../../components/GlowBar';
import { MetricCounter } from '../../components/MetricCounter';
import { StatPill } from '../../components/StatPill';

const ACCENT = COLORS.purple;

const QUESTIONS = [
  { q: 'Do you maintain an up-to-date ICT risk register aligned with ISO 27005?',           score: 92, dora: 'Art. 8' },
  { q: 'Is your Business Continuity Plan tested at least annually with documented outcomes?', score: 78, dora: 'Art. 11' },
  { q: 'Are all sub-processors subject to equivalent contractual ICT security controls?',     score: 65, dora: 'Art. 28' },
  { q: 'Has a Threat-Led Penetration Test (TLPT) been completed in the last 36 months?',     score: 45, dora: 'Art. 26' },
  { q: 'Are audit and access logs retained for a minimum of 5 years per DORA Art. 9?',       score: 88, dora: 'Art. 9'  },
];

function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = computeSpring(frame, fps, 0, 'smooth', 0, 1);
  const y = computeSpring(frame, fps, 0, 'smooth', 24, 0);
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:28,opacity:o,transform:`translateY(${y}px)` }}>
      <Logo delay={0} size="sm" position="center" />
      <div style={{ textAlign:'center' }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:'0 0 8px',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600 }}>Feature Spotlight</p>
        <h1 style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES['3xl'],fontWeight:800,color:COLORS.text,letterSpacing:'-0.03em',margin:0 }}>
          Vendor{' '}<span style={{ color:ACCENT }}>Questionnaires</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          Replace 3–8 week email chains with AI-scored questionnaires. Vendors respond in a portal. You get scored results instantly.
        </p>
      </div>
      {/* Before/after badge */}
      <div style={{ display:'flex',gap:12,alignItems:'center',opacity:computeSpring(frame,fps,30,'smooth',0,1) }}>
        <div style={{ padding:'6px 16px',background:`${COLORS.red}10`,border:`1px solid ${COLORS.red}33`,borderRadius:RADIUS.full }}>
          <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.red,fontWeight:600 }}>Before: 3–8 weeks</span>
        </div>
        <span style={{ color:COLORS.textDim,fontSize:20 }}>→</span>
        <div style={{ padding:'6px 16px',background:`${ACCENT}10`,border:`1px solid ${ACCENT}33`,borderRadius:RADIUS.full }}>
          <span style={{ fontFamily:FONTS.sans,fontSize:13,color:ACCENT,fontWeight:600 }}>After: hours</span>
        </div>
      </div>
    </div>
  );
}

function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const STAGGER = Math.floor(420 / QUESTIONS.length);

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',gap:56,padding:'32px 80px' }}>

      {/* Questions list */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',gap:14 }}>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4,opacity:computeSpring(frame,fps,0,'smooth',0,1) }}>
          <span style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em' }}>Question</span>
          <span style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em' }}>LLM Score</span>
        </div>

        {QUESTIONS.map((q, i) => {
          const delay = i * STAGGER;
          const o = computeSpring(frame, fps, delay, 'smooth', 0, 1);
          const y = computeSpring(frame, fps, delay, 'smooth', 16, 0);
          const scoreColor = q.score >= 80 ? COLORS.green : q.score >= 60 ? COLORS.orange : COLORS.red;
          return (
            <div key={i} style={{ padding:'14px 18px',background:COLORS.surface,borderRadius:RADIUS.lg,border:`1px solid ${COLORS.border}`,boxShadow:SHADOWS.card,opacity:o,transform:`translateY(${y}px)`,display:'flex',flexDirection:'column',gap:10 }}>
              <div style={{ display:'flex',alignItems:'flex-start',gap:14 }}>
                <div style={{ padding:'3px 8px',background:`${COLORS.blue}12`,border:`1px solid ${COLORS.blue}30`,borderRadius:RADIUS.sm,flexShrink:0 }}>
                  <span style={{ fontFamily:FONTS.mono,fontSize:11,color:COLORS.blue,fontWeight:600 }}>{q.dora}</span>
                </div>
                <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.text,lineHeight:1.45,flex:1 }}>{q.q}</span>
              </div>
              <GlowBar value={q.score} delay={delay+12} color={scoreColor} width={600} height={7} showPercent />
            </div>
          );
        })}
      </div>

      {/* Right: summary */}
      <div style={{ display:'flex',flexDirection:'column',gap:24,flexShrink:0,width:260 }}>
        <MetricCounter value={74.2} decimals={1} label="Average compliance score" delay={200} color={ACCENT} fontSize={FONT_SIZES['3xl']} />

        <div style={{ width:'100%',height:1,background:`linear-gradient(90deg, transparent, ${COLORS.border}, transparent)` }} />

        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          <StatPill value="5"    label="Questions scored"   delay={220} color={ACCENT} />
          <StatPill value="&lt; 5s"  label="Scoring time"  delay={232} color={COLORS.green} />
          <StatPill value="100%" label="Audit trail"        delay={244} color={COLORS.blue} />
        </div>

        {/* Risk flags */}
        <div style={{ padding:'12px 16px',background:`${COLORS.orange}08`,border:`1px solid ${COLORS.orange}30`,borderRadius:RADIUS.lg,opacity:computeSpring(frame,fps,300,'smooth',0,1) }}>
          <p style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted,margin:'0 0 8px',fontWeight:600 }}>⚠ Risk flags detected</p>
          <p style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted,margin:0,lineHeight:1.45 }}>Art. 26 TLPT gap — score 45%. Recommend remediation before next supervisory review.</p>
        </div>
      </div>
    </div>
  );
}

function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = computeSpring(frame, fps, 0, 'smooth', 0, 1);
  const s = computeSpring(frame, fps, 8, 'bounce', 0.85, 1);
  const fade = ic(frame, [90, 119], [0, 1]);
  const cur = Math.round(frame/15)%2===0?1:0;
  const glow = `0 0 ${36+Math.sin(frame*0.12)*12}px ${ACCENT}44`;
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24,opacity:o,position:'relative' }}>
      <Logo delay={0} size="sm" position="center" />
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>Send your first questionnaire free at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function VendorQuestionnaires() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
