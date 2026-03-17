/**
 * FeatureSpotlight — Register of Information
 * 750f / 25s, 1920×1080
 * Story: EBA Art. 28(3) XLSX in one click — no consultant needed.
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
import { StatPill } from '../../components/StatPill';

const ACCENT = COLORS.green;

const ROWS = [
  { vendor:'Acme Corp',    type:'ICT Provider',    criticality:'Critical',  status:'Active',  contract:'2026-03', risk: 'Low' },
  { vendor:'Beta Systems', type:'Cloud Storage',   criticality:'Important', status:'Active',  contract:'2025-06', risk: 'Medium' },
  { vendor:'Gamma SaaS',   type:'SaaS Platform',   criticality:'Important', status:'Review',  contract:'2024-12', risk: 'High' },
  { vendor:'Delta Infra',  type:'Data Centre',     criticality:'Critical',  status:'Active',  contract:'2026-09', risk: 'Low' },
  { vendor:'Epsilon Pay',  type:'Payment Rail',    criticality:'Critical',  status:'Active',  contract:'2025-12', risk: 'Low' },
];

const EBA_SHEETS = [
  { name:'RT.01.01', desc:'Entity maintaining the register',      status:'ready' },
  { name:'RT.02.01', desc:'Contractual arrangements',             status:'ready' },
  { name:'RT.03.01', desc:'ICT third-party service providers',    status:'ready' },
  { name:'RT.04.01', desc:'Critical or important functions',      status:'ready' },
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
          Register of{' '}<span style={{ color:ACCENT }}>Information</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          EBA Article 28(3) XLSX — RT.01.01 through RT.04.01 — generated automatically. Ready to submit to your NCA.
        </p>
      </div>
      <div style={{ opacity:computeSpring(frame,fps,30,'smooth',0,1),padding:'8px 20px',background:`${COLORS.blue}0d`,border:`1px solid ${COLORS.blue}33`,borderRadius:RADIUS.full }}>
        <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.blue,fontWeight:600 }}>⚖️ Regulatory requirement under DORA Art. 28(3)</span>
      </div>
    </div>
  );
}

function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exportProgress = computeSpring(frame, fps, 360, 'smooth', 0, 1);
  const exportScale    = computeSpring(frame, fps, 360, 'bounce', 0.8, 1);

  const STAGGER = Math.floor(350 / ROWS.length);

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'flex-start',gap:48,padding:'32px 80px' }}>

      {/* Left: vendor table */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',gap:0,minWidth:0 }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em',margin:'0 0 10px',opacity:computeSpring(frame,fps,0,'smooth',0,1) }}>
          ICT Third-party Vendor Register
        </p>
        <div style={{ background:COLORS.surface,borderRadius:RADIUS.lg,border:`1px solid ${COLORS.border}`,overflow:'hidden',boxShadow:SHADOWS.card }}>
          {/* Header */}
          <div style={{ display:'grid',gridTemplateColumns:'1.8fr 1.3fr 1.1fr 0.9fr 0.9fr 0.7fr',background:COLORS.surfaceAlt,borderBottom:`1px solid ${COLORS.border}`,padding:'10px 18px',gap:12 }}>
            {['Vendor','Type','Criticality','Status','Renewal','Risk'].map(h=>(
              <span key={h} style={{ fontFamily:FONTS.sans,fontSize:11,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.08em' }}>{h}</span>
            ))}
          </div>
          {ROWS.map((row, i) => {
            const rowO = computeSpring(frame, fps, i*STAGGER, 'smooth', 0, 1);
            const statusColor = row.status==='Review' ? COLORS.orange : COLORS.green;
            const riskColor   = row.risk==='High' ? COLORS.red : row.risk==='Medium' ? COLORS.orange : COLORS.green;
            return (
              <div key={row.vendor} style={{ display:'grid',gridTemplateColumns:'1.8fr 1.3fr 1.1fr 0.9fr 0.9fr 0.7fr',padding:'11px 18px',gap:12,borderBottom:i<ROWS.length-1?`1px solid ${COLORS.borderSubtle}`:'none',opacity:rowO }}>
                <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.text,fontWeight:600 }}>{row.vendor}</span>
                <span style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted }}>{row.type}</span>
                <span style={{ fontFamily:FONTS.sans,fontSize:12,color:row.criticality==='Critical'?COLORS.orange:COLORS.textMuted,fontWeight:row.criticality==='Critical'?600:400 }}>{row.criticality}</span>
                <span style={{ fontFamily:FONTS.mono,fontSize:12,color:statusColor,fontWeight:600 }}>{row.status}</span>
                <span style={{ fontFamily:FONTS.mono,fontSize:12,color:COLORS.textDim }}>{row.contract}</span>
                <span style={{ fontFamily:FONTS.mono,fontSize:11,color:riskColor,fontWeight:700 }}>{row.risk}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: EBA sheets + export */}
      <div style={{ display:'flex',flexDirection:'column',gap:20,flexShrink:0,width:280 }}>
        <div>
          <p style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em',margin:'0 0 12px' }}>EBA Worksheet Status</p>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {EBA_SHEETS.map((s,i) => {
              const o = computeSpring(frame, fps, 40+i*25, 'smooth', 0, 1);
              return (
                <div key={s.name} style={{ display:'flex',alignItems:'center',gap:12,padding:'8px 14px',background:COLORS.surface,borderRadius:RADIUS.md,border:`1px solid ${COLORS.border}`,opacity:o }}>
                  <span style={{ fontFamily:FONTS.mono,fontSize:12,color:ACCENT,fontWeight:700,width:68,flexShrink:0 }}>{s.name}</span>
                  <span style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted,flex:1 }}>{s.desc}</span>
                  <span style={{ color:ACCENT,fontSize:14 }}>✓</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Export section */}
        <div style={{ opacity:exportProgress,transform:`scale(${exportScale})` }}>
          <GlowBar value={100} delay={360} color={ACCENT} width={260} label="Generating all 4 sheets…" height={10} />
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:12,opacity:computeSpring(frame,fps,400,'bounce',0,1) }}>
          <div style={{
            display:'flex',alignItems:'center',justifyContent:'center',gap:10,
            padding:'14px 24px',
            background:ACCENT,
            borderRadius:RADIUS.full,
            boxShadow:`0 0 24px 6px ${COLORS.greenGlow}`,
            cursor:'pointer',
          }}>
            <span style={{ fontSize:18 }}>📥</span>
            <span style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,fontWeight:700,color:'#000' }}>Export RoI XLSX</span>
          </div>
          <div style={{ textAlign:'center' }}>
            <span style={{ fontFamily:FONTS.mono,fontSize:11,color:COLORS.textDim }}>DORA Art. 28(3) · EBA RTS format</span>
          </div>
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:10,opacity:computeSpring(frame,fps,440,'smooth',0,1) }}>
          <StatPill value="4"     label="EBA sheets auto-filled" delay={440} color={ACCENT} />
          <StatPill value="1"     label="Click to export"        delay={452} color={COLORS.blue} />
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
  const glow = `0 0 ${36+Math.sin(frame*0.12)*12}px ${COLORS.greenGlow}`;
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24,opacity:o,position:'relative' }}>
      <Logo delay={0} size="sm" position="center" />
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>Generate your EBA RoI free at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function RegisterOfInfo() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
