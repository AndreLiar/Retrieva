/**
 * FeatureSpotlight — Gap Analysis
 * 750f / 25s, 1920×1080
 * Story: Manual gap analysis is broken → Retrieva automates it instantly.
 */
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { Logo } from '../../components/Logo';
import { GapBadge } from '../../components/GapBadge';
import { ComplianceRing } from '../../components/ComplianceRing';
import { StatPill } from '../../components/StatPill';

const ACCENT = COLORS.blue;

const CLAUSES = [
  { article: 'Art. 5',  title: 'ICT Risk Governance',            status: 'covered'  as const },
  { article: 'Art. 6',  title: 'ICT Risk Framework',             status: 'covered'  as const },
  { article: 'Art. 8',  title: 'Risk Management',                status: 'covered'  as const },
  { article: 'Art. 11', title: 'Business Continuity',            status: 'partial'  as const },
  { article: 'Art. 13', title: 'Third-party Controls',           status: 'covered'  as const },
  { article: 'Art. 17', title: 'Incident Classification',        status: 'partial'  as const },
  { article: 'Art. 19', title: 'Reporting to Authorities',       status: 'missing'  as const },
  { article: 'Art. 25', title: 'TLPT Programme',                 status: 'covered'  as const },
  { article: 'Art. 28', title: 'Register of Information',        status: 'covered'  as const },
  { article: 'Art. 30', title: 'Key Contractual Provisions',     status: 'partial'  as const },
];

// ── Intro 0–59 ───────────────────────────────────────────────────────────────
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
          Automated{' '}<span style={{ color:ACCENT }}>Gap Analysis</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          AI maps your vendor documentation across all 28 DORA articles in minutes, not weeks.
        </p>
      </div>
    </div>
  );
}

// ── Demo 60–629 ───────────────────────────────────────────────────────────────
function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const STAGGER = Math.floor(570 / CLAUSES.length);

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',gap:60,padding:'40px 80px' }}>

      {/* Article list */}
      <div style={{ display:'flex',flexDirection:'column',gap:12,flex:1 }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em',margin:'0 0 4px',opacity:computeSpring(frame,fps,0,'smooth',0,1) }}>
          DORA Article Coverage
        </p>
        {CLAUSES.map((c, i) => {
          const delay = i * STAGGER;
          const o = computeSpring(frame, fps, delay, 'smooth', 0, 1);
          const x = computeSpring(frame, fps, delay, 'smooth', -20, 0);
          return (
            <div key={c.article} style={{ display:'flex',alignItems:'center',gap:14,padding:'10px 16px',background:COLORS.surface,borderRadius:RADIUS.lg,border:`1px solid ${COLORS.border}`,opacity:o,transform:`translateX(${x}px)` }}>
              <span style={{ fontFamily:FONTS.mono,fontSize:12,color:COLORS.textDim,width:58,flexShrink:0 }}>{c.article}</span>
              <span style={{ fontFamily:FONTS.sans,fontSize:14,color:COLORS.textMuted,flex:1 }}>{c.title}</span>
              <GapBadge status={c.status} delay={delay+8} />
            </div>
          );
        })}
      </div>

      {/* Right panel: ring + stats */}
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:32,flexShrink:0 }}>
        <ComplianceRing value={82} size={240} strokeWidth={20} delay={30} color={COLORS.green} label="DORA Score" sublabel="Overall Coverage" />

        {/* Status tally */}
        <div style={{ display:'flex',gap:24 }}>
          {[{l:'Covered',n:6,c:COLORS.green},{l:'Partial',n:3,c:COLORS.orange},{l:'Missing',n:1,c:COLORS.red}].map(({l,n,c})=>(
            <div key={l} style={{ textAlign:'center',opacity:computeSpring(frame,fps,120,'smooth',0,1) }}>
              <div style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.xl,fontWeight:800,color:c }}>{n}</div>
              <div style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Key stats */}
        <div style={{ display:'flex',flexDirection:'column',gap:12,width:'100%' }}>
          <StatPill value="&lt; 2 min" label="Analysis time"  delay={200} color={ACCENT} />
          <StatPill value="28"     label="DORA articles"  delay={215} color={COLORS.green} />
          <StatPill value="100%"   label="EBA-ready XLSX" delay={230} color={COLORS.purple} />
        </div>

        {/* Export nudge */}
        <div style={{ padding:'10px 18px',background:`${COLORS.green}0a`,border:`1px solid ${COLORS.green}30`,borderRadius:RADIUS.full,opacity:computeSpring(frame,fps,280,'smooth',0,1) }}>
          <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.green,fontWeight:600 }}>📋 Export EBA Art. 28(3) RoI → XLSX</span>
        </div>
      </div>
    </div>
  );
}

// ── CTA 630–749 ───────────────────────────────────────────────────────────────
function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = computeSpring(frame, fps, 0, 'smooth', 0, 1);
  const s = computeSpring(frame, fps, 8, 'bounce', 0.85, 1);
  const fade = ic(frame, [90, 119], [0, 1]);
  const cur = Math.round(frame/15)%2===0?1:0;
  const glow = `0 0 ${36+Math.sin(frame*0.12)*12}px ${COLORS.blueGlow}`;
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24,opacity:o,position:'relative' }}>
      <Logo delay={0} size="sm" position="center" />
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>See all features at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function GapAnalysis() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
