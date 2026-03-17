/**
 * FeatureSpotlight — DORA AI Copilot
 * 750f / 25s, 1920×1080
 * Story: Ask anything about your DORA compliance in plain English → instant expert answer.
 */
import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { ic } from '../../lib/utils';
import { Background } from '../../components/Background';
import { GridLines } from '../../components/GridLines';
import { Logo } from '../../components/Logo';
import { CodeLine } from '../../components/CodeLine';
import { Badge } from '../../components/Badge';
import { StatPill } from '../../components/StatPill';

const ACCENT = COLORS.green;

const EXCHANGES = [
  {
    q: 'Which DORA articles apply to our cloud provider relationships?',
    a: 'Articles 28–44 govern ICT third-party risk. Key obligations: Art. 28 (RoI), Art. 30 (contractual clauses), Art. 31 (critical providers). Your AWS agreement may need updating to cover Art. 30(2)(g) exit strategy requirements.',
    source: 'Sources: DORA Art. 28–30 · AWS_MSA_2024.pdf p.14',
    confidence: 94,
    qStart: 20,
    aStart: 60,
    srcStart: 150,
    confStart: 160,
  },
  {
    q: 'Is our incident response time compliant with Art. 19?',
    a: 'Art. 19 requires notification to the NCA within 4 hours of classifying a major incident. Your IRP states a 6-hour window. This gap needs remediation before your next supervisory review.',
    source: 'Sources: DORA Art. 19(4) · Incident_Response_Plan_v2.docx',
    confidence: 87,
    qStart: 280,
    aStart: 320,
    srcStart: 420,
    confStart: 430,
  },
];

function ConfidenceBar({ score, delay, frame, fps }: { score: number; delay: number; frame: number; fps: number }) {
  const w = computeSpring(frame, fps, delay, 'smooth', 0, score / 100);
  const o = computeSpring(frame, fps, delay, 'smooth', 0, 1);
  const color = score >= 90 ? COLORS.green : score >= 75 ? ACCENT : COLORS.orange;
  return (
    <div style={{ display:'flex',alignItems:'center',gap:10,opacity:o }}>
      <span style={{ fontFamily:FONTS.mono,fontSize:11,color:COLORS.textDim,whiteSpace:'nowrap' }}>Confidence</span>
      <div style={{ flex:1,height:4,background:COLORS.surfaceAlt,borderRadius:99,overflow:'hidden',minWidth:80 }}>
        <div style={{ height:'100%',width:`${w*100}%`,background:color,borderRadius:99,boxShadow:`0 0 6px ${color}` }} />
      </div>
      <span style={{ fontFamily:FONTS.mono,fontSize:12,color,fontWeight:700,minWidth:32 }}>{Math.round(w*score)}%</span>
    </div>
  );
}

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
          DORA{' '}<span style={{ color:ACCENT }}>AI Copilot</span>
        </h1>
        <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.md,color:COLORS.textMuted,margin:'12px 0 0',lineHeight:1.5 }}>
          Ask compliance questions in plain English. Get instant answers grounded in your docs and DORA articles.
        </p>
      </div>
    </div>
  );
}

function Demo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chatO = computeSpring(frame, fps, 0, 'smooth', 0, 1);

  return (
    <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',gap:48,padding:'32px 80px' }}>

      {/* Chat window */}
      <div style={{ flex:1,background:COLORS.surface,borderRadius:RADIUS.xl,border:`1px solid ${COLORS.border}`,boxShadow:SHADOWS.card,overflow:'hidden',opacity:chatO }}>
        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',gap:10,padding:'14px 20px',borderBottom:`1px solid ${COLORS.border}`,background:COLORS.surfaceAlt }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:ACCENT,boxShadow:`0 0 8px ${ACCENT}` }} />
          <span style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.sm,color:COLORS.textMuted,fontWeight:600 }}>DORA Copilot</span>
          <div style={{ marginLeft:'auto',padding:'3px 10px',background:`${ACCENT}18`,border:`1px solid ${ACCENT}33`,borderRadius:RADIUS.full }}>
            <span style={{ fontFamily:FONTS.mono,fontSize:11,color:ACCENT }}>GPT-4o · RAG</span>
          </div>
        </div>

        <div style={{ padding:'20px 24px',display:'flex',flexDirection:'column',gap:18 }}>
          {EXCHANGES.map((ex, idx) => (
            <React.Fragment key={idx}>
              {/* User bubble */}
              {frame >= ex.qStart && (
                <div style={{ display:'flex',justifyContent:'flex-end' }}>
                  <div style={{ background:`${COLORS.blue}1a`,border:`1px solid ${COLORS.blue}33`,borderRadius:RADIUS.lg,padding:'10px 16px',maxWidth:'72%',borderBottomRightRadius:4 }}>
                    <CodeLine text={ex.q} startFrame={ex.qStart} durationFrames={32} color={COLORS.text} fontSize={13} />
                  </div>
                </div>
              )}
              {/* AI bubble */}
              {frame >= ex.aStart && (
                <div style={{ display:'flex',gap:10 }}>
                  <div style={{ width:28,height:28,borderRadius:'50%',background:`${ACCENT}18`,border:`1px solid ${ACCENT}33`,display:'flex',alignItems:'center',justifyContent:'center',color:ACCENT,fontSize:14,flexShrink:0,boxShadow:`0 0 10px ${ACCENT}44` }}>✦</div>
                  <div style={{ background:COLORS.surfaceAlt,borderRadius:RADIUS.lg,padding:'12px 16px',maxWidth:'80%',borderBottomLeftRadius:4,display:'flex',flexDirection:'column',gap:10 }}>
                    <CodeLine text={ex.a} startFrame={ex.aStart} durationFrames={80} color={COLORS.textMuted} fontSize={13} showCursor={false} />
                    {frame >= ex.srcStart && (
                      <div style={{ opacity:computeSpring(frame,fps,ex.srcStart,'smooth',0,1) }}>
                        <Badge text={ex.source} color={COLORS.purple} delay={ex.srcStart} />
                      </div>
                    )}
                    {frame >= ex.confStart && (
                      <ConfidenceBar score={ex.confidence} delay={ex.confStart} frame={frame} fps={fps} />
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Input bar */}
        <div style={{ padding:'12px 20px',borderTop:`1px solid ${COLORS.border}`,display:'flex',gap:10 }}>
          <div style={{ flex:1,height:36,background:COLORS.bg,borderRadius:RADIUS.full,border:`1px solid ${COLORS.border}`,display:'flex',alignItems:'center',padding:'0 16px' }}>
            <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.textDim }}>Ask a DORA compliance question…</span>
          </div>
          <div style={{ width:36,height:36,borderRadius:'50%',background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700,fontSize:18,flexShrink:0,boxShadow:`0 0 12px ${ACCENT}66` }}>↑</div>
        </div>
      </div>

      {/* Right panel: key stats */}
      <div style={{ display:'flex',flexDirection:'column',gap:20,flexShrink:0,width:240 }}>
        <h3 style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,fontWeight:700,color:COLORS.text,margin:0 }}>Why AI Copilot?</h3>
        {[
          { icon:'⚡', text:'Instant answers — no waiting for your legal team' },
          { icon:'📚', text:'Grounded in your docs + DORA articles' },
          { icon:'🎯', text:'Confidence score on every response' },
          { icon:'🔗', text:'Source citations with page references' },
        ].map(({icon,text}, i) => {
          const o = computeSpring(frame, fps, 40+i*20, 'smooth', 0, 1);
          const x = computeSpring(frame, fps, 40+i*20, 'smooth', 20, 0);
          return (
            <div key={i} style={{ display:'flex',gap:12,alignItems:'flex-start',opacity:o,transform:`translateX(${x}px)` }}>
              <span style={{ fontSize:20,flexShrink:0 }}>{icon}</span>
              <span style={{ fontFamily:FONTS.sans,fontSize:13,color:COLORS.textMuted,lineHeight:1.45 }}>{text}</span>
            </div>
          );
        })}
        <div style={{ marginTop:12,display:'flex',flexDirection:'column',gap:10 }}>
          <StatPill value="&lt; 3s"  label="Response time" delay={160} color={ACCENT} />
          <StatPill value="94%"  label="Avg confidence"  delay={172} color={COLORS.blue} />
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
      <p style={{ fontFamily:FONTS.sans,fontSize:FONT_SIZES.base,color:COLORS.textMuted,margin:0 }}>Try the AI Copilot free at</p>
      <div style={{ display:'flex',alignItems:'center',padding:'14px 32px',background:`${ACCENT}12`,border:`1.5px solid ${ACCENT}55`,borderRadius:RADIUS.xl,boxShadow:glow,transform:`scale(${s})` }}>
        <span style={{ fontFamily:FONTS.mono,fontSize:FONT_SIZES.xl,fontWeight:700,color:ACCENT }}>retrieva.online</span>
        <span style={{ display:'inline-block',width:'0.5em',height:'1em',background:ACCENT,marginLeft:4,verticalAlign:'text-bottom',opacity:cur }} />
      </div>
      <div style={{ position:'absolute',inset:0,background:'#000',opacity:fade,pointerEvents:'none' }} />
    </div>
  );
}

export function DoraCopilot() {
  return (
    <Background variant="gradient">
      <GridLines opacity={0.025} />
      <Sequence from={0}   durationInFrames={60}><Intro /></Sequence>
      <Sequence from={60}  durationInFrames={570}><Demo /></Sequence>
      <Sequence from={630} durationInFrames={120}><CTA /></Sequence>
    </Background>
  );
}
