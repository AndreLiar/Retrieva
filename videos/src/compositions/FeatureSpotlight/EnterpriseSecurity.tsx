/**
 * FeatureSpotlight — Enterprise-Grade Security
 * 750f / 25s, 1920×1080
 * Story: Built for regulated industries. Every layer hardened.
 */
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { Logo } from '../../components/Logo';
import { Badge } from '../../components/Badge';
import { StatPill } from '../../components/StatPill';

const ACCENT = COLORS.blue;

const PILLARS = [
  { icon:'🔒', title:'Workspace Isolation',   sub:'Strict multi-tenant data separation. No cross-workspace data leakage possible.',      color:COLORS.blue,   check:'✓' },
  { icon:'🕵️', title:'PII Auto-detection',    sub:'Personal data identified and redacted before embedding into the vector store.',        color:COLORS.purple, check:'✓' },
  { icon:'📋', title:'Immutable Audit Log',   sub:'Every query, upload, and export logged with timestamps. 5-year retention.',             color:COLORS.green,  check:'✓' },
  { icon:'🗝️', title:'Encrypted Secrets',    sub:'SOPS + age encryption. Zero plaintext secrets in code or environment variables.',      color:COLORS.orange, check:'✓' },
];

const CERTIFICATIONS = [
  { label:'SOC 2 Ready',         color:COLORS.green  },
  { label:'GDPR Compliant',      color:COLORS.blue   },
  { label:'DORA Art. 9 Aligned', color:COLORS.blue   },
  { label:'ISO 27001 Ready',     color:COLORS.purple },
];

function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = computeSpring(frame, fps, 0, 'smooth', 0, 1);
  const y = computeSpring(frame, fps, 0, 'smooth', 24, 0);
  const shieldScale = 1 + Math.sin(frame * 0.15) * 0.04;
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:28,opacity:o,transform:`translateY(${y}px)` }}>
      <div style={{ transform:`scale(${shieldScale})`,filter:`drop-shadow(0 0 24px ${COLORS.blueGlow})` }}>
        <svg width={80} height={80} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${ACCENT}18`} />
          <polyline points="9 12 11 14 15 10" strokeWidth="2.5" stroke={COLORS.green} />
        </svg>
      </div>
      <Logo delay={0} size="sm" position="center" />
      <div style={{ textAlign:'center' }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:'0 0 8px',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600 }}>Feature Spotlight</p>
        <h1 style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES['3xl'],fontWeight:800,color:COLORS.text,letterSpacing:'-0.03em',margin:0 }}>
          Enterprise-Grade{' '}<span style={{ color:ACCENT }}>Security</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          Built for regulated industries. Every layer is hardened, logged, and encrypted.
        </p>
      </div>
    </div>
  );
}

function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slow shield rotation
  const shieldRotation = (frame / 570) * 360;
  const shieldGlow = 28 + Math.sin(frame * 0.08) * 8;

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',gap:64,padding:'32px 80px' }}>

      {/* Shield + certs */}
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:28,flexShrink:0 }}>
        {/* Animated shield */}
        <div style={{ position:'relative',width:160,height:160,display:'flex',alignItems:'center',justifyContent:'center' }}>
          {/* Outer orbit ring */}
          <svg style={{ position:'absolute',top:0,left:0,transform:`rotate(${shieldRotation}deg)` }} width={160} height={160} viewBox="0 0 160 160">
            <circle cx={80} cy={80} r={74} fill="none" stroke={`${ACCENT}22`} strokeWidth={1.5} strokeDasharray="4 8" />
            <circle cx={80} cy={6} r={5} fill={ACCENT} />
          </svg>
          {/* Main shield */}
          <div style={{ filter:`drop-shadow(0 0 ${shieldGlow}px ${COLORS.blueGlow})` }}>
            <svg width={100} height={100} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${ACCENT}18`} />
              <polyline points="9 12 11 14 15 10" strokeWidth="2.5" stroke={COLORS.green} />
            </svg>
          </div>
        </div>

        {/* Cert badges */}
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',maxWidth:220 }}>
          {CERTIFICATIONS.map((cert, i) => {
            const o = computeSpring(frame, fps, 40+i*20, 'bounce', 0, 1);
            return (
              <div key={cert.label} style={{ opacity:o }}>
                <Badge text={cert.label} color={cert.color} delay={40+i*20} />
              </div>
            );
          })}
        </div>

        <StatPill value="0" label="Breaches since launch" delay={140} color={COLORS.green} />
      </div>

      {/* Security pillars */}
      <div style={{ flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gap:18 }}>
        {PILLARS.map((p, i) => {
          const delay = i * 45;
          const o = computeSpring(frame, fps, delay, 'smooth', 0, 1);
          const y = computeSpring(frame, fps, delay, 'smooth', 20, 0);
          return (
            <div key={p.title} style={{
              display:'flex',flexDirection:'column',gap:12,
              padding:'22px 20px',
              background:COLORS.surface,
              borderRadius:RADIUS.xl,
              border:`1px solid ${COLORS.border}`,
              borderTop:`2px solid ${p.color}`,
              boxShadow:SHADOWS.card,
              opacity:o,
              transform:`translateY(${y}px)`,
            }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <span style={{ fontSize:28 }}>{p.icon}</span>
                <div style={{ width:22,height:22,borderRadius:'50%',background:`${COLORS.green}18`,border:`1px solid ${COLORS.green}44`,display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <span style={{ color:COLORS.green,fontSize:12,fontWeight:700 }}>{p.check}</span>
                </div>
              </div>
              <div>
                <div style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,fontWeight:700,color:COLORS.text,marginBottom:6 }}>{p.title}</div>
                <div style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted,lineHeight:1.5 }}>{p.sub}</div>
              </div>
            </div>
          );
        })}
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
  const glow = `0 0 ${36+Math.sin(frame*0.12)*12}px ${COLORS.blueGlow}`;
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24,opacity:o,position:'relative' }}>
      <Logo delay={0} size="sm" position="center" />
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>Enterprise security, starter price. Try at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function EnterpriseSecurity() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
