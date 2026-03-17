import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SHADOWS } from '../../lib/brand';
import { computeSpring } from '../../lib/spring';
import { SectionTitle } from '../../components/SectionTitle';
import { Badge } from '../../components/Badge';

const ALERTS = [
  {
    type: 'cert',
    color: COLORS.orange,
    title: 'Certificate Expiry — 30 days',
    vendor: 'Acme Corp · ISO 27001',
    badge: 'Expiring Soon',
    detail: 'Cert valid until Jan 15, 2025',
  },
  {
    type: 'contract',
    color: COLORS.blue,
    title: 'Contract Renewal — 90 days',
    vendor: 'Beta Systems · MSA',
    badge: 'Action Required',
    detail: 'Contract ends Mar 31, 2025',
  },
  {
    type: 'overdue',
    color: COLORS.red,
    title: 'Annual Review Overdue',
    vendor: 'Gamma SaaS · DORA Assessment',
    badge: 'Overdue',
    detail: 'Last assessed 14 months ago',
  },
];

export function Scene06Alerts() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        padding: '0 100px',
      }}
    >
      <SectionTitle
        title="Monitoring Alerts"
        accentWord="Alerts"
        accentColor={COLORS.orange}
        delay={0}
        fontSize={FONT_SIZES.xl}
        subline="Never miss a certification deadline or renewal window"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 700 }}>
        {ALERTS.map((alert, i) => {
          const delay = i * 60;
          const translateX = computeSpring(frame, fps, delay, 'snappy', 80, 0);
          const opacity = computeSpring(frame, fps, delay, 'smooth', 0, 1);

          return (
            <div
              key={alert.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '18px 24px',
                background: COLORS.surface,
                borderRadius: RADIUS.lg,
                border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${alert.color}`,
                boxShadow: SHADOWS.card,
                opacity,
                transform: `translateX(${translateX}px)`,
              }}
            >
              {/* Bell icon */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: RADIUS.md,
                  background: `${alert.color}1a`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: alert.color,
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                🔔
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: FONT_SIZES.base,
                    fontWeight: 600,
                    color: COLORS.text,
                    marginBottom: 4,
                  }}
                >
                  {alert.title}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: FONT_SIZES.sm,
                    color: COLORS.textMuted,
                  }}
                >
                  {alert.vendor}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <Badge text={alert.badge} color={alert.color} delay={delay + 10} />
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: FONT_SIZES.xs,
                    color: COLORS.textDim,
                  }}
                >
                  {alert.detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
