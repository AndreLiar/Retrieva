/**
 * FeatureSpotlight — Monitoring & Alerts
 * 750f / 25s, 1920×1080
 * Story: Never miss a cert expiry or contract renewal — automated alerts keep you ahead.
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

const ACCENT = COLORS.orange;

const ALERTS = [
  {
    urgency: 'critical',
    color: COLORS.red,
    emoji: '🔴',
    title: 'ISO 27001 Certificate Expiring',
    vendor: 'Acme Corp',
    detail: 'Expires in 7 days — Jan 22, 2025',
    badge: '7 DAYS',
    dora: 'Art. 28(2)(d)',
    delay: 0,
  },
  {
    urgency: 'warning',
    color: COLORS.orange,
    emoji: '🟠',
    title: 'MSA Contract Renewal Due',
    vendor: 'Beta Systems',
    detail: 'Renewal window opens Mar 31, 2025',
    badge: '90 DAYS',
    dora: 'Art. 30(2)',
    delay: 60,
  },
  {
    urgency: 'info',
    color: COLORS.blue,
    emoji: '🔵',
    title: 'Annual DORA Assessment Overdue',
    vendor: 'Gamma SaaS',
    detail: 'Last assessed 14 months ago',
    badge: 'OVERDUE',
    dora: 'Art. 28(1)(a)',
    delay: 120,
  },
];

const TIMELINE = [
  { label: '90 days', event: 'Contract renewal window', color: COLORS.blue },
  { label: '30 days', event: 'Certificate expiry warning', color: COLORS.orange },
  { label: '7 days',  event: 'Critical cert alert',      color: COLORS.red },
  { label: 'Day 0',  event: 'Auto-escalation to CISO',  color: COLORS.red },
];

function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = computeSpring(frame, fps, 0, 'smooth', 0, 1);
  const y = computeSpring(frame, fps, 0, 'smooth', 24, 0);
  // Ringing bell
  const bellAngle = Math.sin(frame * 0.4) * (frame < 30 ? frame * 0.5 : 15);
  return (
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:28,opacity:o,transform:`translateY(${y}px)` }}>
      <span style={{ fontSize:64,display:'block',transform:`rotate(${bellAngle}deg)`,transformOrigin:'top center',filter:`drop-shadow(0 0 16px ${ACCENT}88)` }}>🔔</span>
      <Logo delay={0} size="sm" position="center" />
      <div style={{ textAlign:'center' }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:'0 0 8px',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600 }}>Feature Spotlight</p>
        <h1 style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES['3xl'],fontWeight:800,color:COLORS.text,letterSpacing:'-0.03em',margin:0 }}>
          Monitoring{' '}<span style={{ color:ACCENT }}>&amp; Alerts</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          Automated 24-hour alerts for cert expiry (90/30/7 days), contract renewals, and overdue annual assessments.
        </p>
      </div>
    </div>
  );
}

function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Pulse on critical card
  const pulse = 0.6 + Math.sin(frame * 0.2) * 0.4;

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',gap:56,padding:'32px 80px' }}>

      {/* Alert cards */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',gap:18 }}>
        <p style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em',margin:'0 0 4px',opacity:computeSpring(frame,fps,0,'smooth',0,1) }}>Active Alerts</p>
        {ALERTS.map((alert) => {
          const o = computeSpring(frame, fps, alert.delay, 'smooth', 0, 1);
          const x = computeSpring(frame, fps, alert.delay, 'snappy', 80, 0);
          const isCritical = alert.urgency === 'critical';
          const boxShadow = isCritical
            ? `0 0 ${20 * pulse}px ${8 * pulse}px ${COLORS.red}22, ${SHADOWS.card}`
            : SHADOWS.card;

          return (
            <div key={alert.title} style={{
              display:'flex',alignItems:'center',gap:18,
              padding:'16px 22px',
              background: isCritical ? `${COLORS.red}08` : COLORS.surface,
              borderRadius:RADIUS.xl,
              border:`1px solid ${alert.color}`,
              borderLeft:`4px solid ${alert.color}`,
              boxShadow,
              opacity:o,
              transform:`translateX(${x}px)`,
            }}>
              <span style={{ fontSize:28,flexShrink:0 }}>{alert.emoji}</span>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:4 }}>
                  <span style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,fontWeight:700,color:COLORS.text }}>{alert.title}</span>
                  <div style={{ padding:'2px 8px',background:`${alert.color}18`,borderRadius:RADIUS.full,border:`1px solid ${alert.color}44`,flexShrink:0 }}>
                    <span style={{ fontFamily:FONTS.mono,fontSize:11,color:alert.color,fontWeight:700 }}>{alert.badge}</span>
                  </div>
                </div>
                <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                  <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.textMuted }}>{alert.vendor}</span>
                  <span style={{ fontFamily:FONTS.mono,fontSize:12,color:COLORS.textDim }}>·</span>
                  <span style={{ fontFamily:FONTS.mono,fontSize:12,color:COLORS.textDim }}>{alert.detail}</span>
                </div>
              </div>
              <div style={{ padding:'4px 10px',background:`${COLORS.blue}0d`,border:`1px solid ${COLORS.blue}22`,borderRadius:RADIUS.sm,flexShrink:0 }}>
                <span style={{ fontFamily:FONTS.mono,fontSize:11,color:COLORS.blue }}>{alert.dora}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right panel: timeline + stats */}
      <div style={{ display:'flex',flexDirection:'column',gap:24,flexShrink:0,width:260 }}>
        <div>
          <p style={{ fontFamily:FONTS.sans,fontSize:12,fontWeight:600,color:COLORS.textDim,textTransform:'uppercase',letterSpacing:'0.1em',margin:'0 0 14px' }}>Alert Timeline</p>
          <div style={{ display:'flex',flexDirection:'column',gap:0,position:'relative' }}>
            {/* Vertical line */}
            <div style={{ position:'absolute',left:6,top:8,bottom:8,width:1,background:COLORS.border }} />
            {TIMELINE.map((t,i) => {
              const o = computeSpring(frame, fps, 80+i*30, 'smooth', 0, 1);
              return (
                <div key={t.label} style={{ display:'flex',gap:16,alignItems:'flex-start',paddingBottom:16,opacity:o,position:'relative' }}>
                  <div style={{ width:13,height:13,borderRadius:'50%',background:t.color,boxShadow:`0 0 8px ${t.color}`,flexShrink:0,marginTop:2,zIndex:1 }} />
                  <div>
                    <div style={{ fontFamily:FONTS.mono,fontSize:12,color:t.color,fontWeight:700,marginBottom:2 }}>{t.label}</div>
                    <div style={{ fontFamily:FONTS.sans,fontSize:12,color:COLORS.textMuted }}>{t.event}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          <StatPill value="24h"  label="Alert frequency"     delay={220} color={ACCENT} />
          <StatPill value="3"    label="Alert thresholds"    delay={232} color={COLORS.blue} />
          <StatPill value="100%" label="Vendor coverage"     delay={244} color={COLORS.green} />
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
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>Never miss a deadline — start free at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function MonitoringAlerts() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
