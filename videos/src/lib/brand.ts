// Brand tokens derived from frontend globals.css + tailwind.config.ts

export const COLORS = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1a1a1a',
  border: '#262626',
  borderSubtle: '#1f1f1f',

  text: '#fafafa',
  textMuted: '#a3a3a3',
  textDim: '#525252',

  green: '#22c55e',
  greenDim: '#16a34a',
  greenGlow: 'rgba(34,197,94,0.3)',

  blue: '#3b82f6',
  blueDim: '#2563eb',
  blueGlow: 'rgba(59,130,246,0.3)',

  orange: '#f59e0b',
  orangeGlow: 'rgba(245,158,11,0.3)',

  purple: '#a855f7',
  purpleGlow: 'rgba(168,85,247,0.3)',

  red: '#ef4444',
  redGlow: 'rgba(239,68,68,0.3)',
} as const;

// Per-domain accent colors for DORA pillars
export const DORA_DOMAINS = [
  { label: 'ICT Risk Management', color: COLORS.blue },
  { label: 'Incident Reporting', color: COLORS.orange },
  { label: 'Digital Operational Resilience Testing', color: COLORS.purple },
  { label: 'Third-party Risk', color: COLORS.green },
  { label: 'Information Sharing', color: COLORS.red },
] as const;

// Gap status colors
export const GAP_COLORS = {
  covered: COLORS.green,
  partial: COLORS.orange,
  missing: COLORS.red,
} as const;

export const FONTS = {
  sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'Geist Mono', 'Fira Code', 'Cascadia Code', monospace",
} as const;

export const FONT_SIZES = {
  xs: 14,
  sm: 16,
  base: 18,
  md: 22,
  lg: 28,
  xl: 36,
  '2xl': 48,
  '3xl': 64,
  '4xl': 80,
  display: 96,
} as const;

export const SPACING = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  '2xl': 96,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  glowBlue: `0 0 24px 4px ${COLORS.blueGlow}`,
  glowGreen: `0 0 24px 4px ${COLORS.greenGlow}`,
  glowOrange: `0 0 24px 4px ${COLORS.orangeGlow}`,
  glowPurple: `0 0 24px 4px ${COLORS.purpleGlow}`,
  card: '0 4px 24px rgba(0,0,0,0.6)',
} as const;

// Remotion spring presets
export const SPRINGS = {
  snappy: { damping: 16, stiffness: 200, mass: 0.8 },
  smooth: { damping: 20, stiffness: 120, mass: 1 },
  bounce: { damping: 10, stiffness: 180, mass: 0.9 },
  slow: { damping: 30, stiffness: 80, mass: 1.2 },
} as const;

// Canvas constants
export const FPS = 30;
export const CANVAS = {
  wide: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;
