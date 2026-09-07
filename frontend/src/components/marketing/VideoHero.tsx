'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Upload, ShieldCheck, Network, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * On-brand animated "product loop" — replaces the old static product-explainer.mp4. A dark
 * app-window mock that cycles the real workflow (upload evidence → map to DORA → concentration
 * graph → Register), reusing the brand's node/graph motif. No video toolchain; pure React/CSS,
 * and it freezes on the graph step under prefers-reduced-motion.
 */
const STEPS = [
  { key: 'upload', label: 'Upload evidence', icon: Upload },
  { key: 'assess', label: 'Map to DORA Art. 28–30', icon: ShieldCheck },
  { key: 'graph', label: 'Concentration graph', icon: Network },
  { key: 'register', label: 'Register of Information', icon: FileSpreadsheet },
] as const;

export function VideoHero() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setActive((i) => (i + 1) % STEPS.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <section className="container mx-auto px-4 my-4">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          style={{ boxShadow: '0 0 80px 0 hsl(var(--primary)/0.12) inset' }}
        />
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 font-mono text-xs text-muted-foreground">retrieva.online · workspace</span>
        </div>

        <div className="grid sm:grid-cols-[220px_1fr]">
          {/* step rail */}
          <div className="hidden border-r border-border p-4 sm:block">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const on = i === active;
                return (
                  <li
                    key={s.key}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      on ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${on ? 'text-primary' : 'text-muted-foreground/60'}`} />
                    <span className="truncate">{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* panel */}
          <div className="relative min-h-[320px] p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={STEPS[active].key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="h-full"
              >
                {STEPS[active].key === 'upload' && <UploadPanel />}
                {STEPS[active].key === 'assess' && <AssessPanel />}
                {STEPS[active].key === 'graph' && <GraphPanel />}
                {STEPS[active].key === 'register' && <RegisterPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-muted-foreground">
    <FileSpreadsheet className="h-4 w-4 text-primary/70" />
    {children}
  </div>
);

function UploadPanel() {
  return (
    <div>
      <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] p-6 text-center text-sm text-muted-foreground">
        Drop vendor evidence — or pull from the trust portal
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Chip>OpenAI — SOC 2 Type II.pdf</Chip>
        <Chip>Azure — ISO 27001.pdf</Chip>
        <Chip>Datadog — DPA.pdf</Chip>
        <Chip>Subprocessor list.xlsx</Chip>
      </div>
    </div>
  );
}

function AssessPanel() {
  const rows = [
    { c: 'Art. 28(2) — contractual arrangements', s: 'ok' },
    { c: 'Art. 28(4) — concentration assessment', s: 'ok' },
    { c: 'Art. 30(2)(d) — exit strategy', s: 'warn' },
    { c: 'Art. 30(2)(e) — subcontracting chain', s: 'gap' },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.c} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3 text-sm">
          {r.s === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
          {r.s === 'warn' && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
          {r.s === 'gap' && <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#FB5B5B' }} />}
          <span className="text-muted-foreground">{r.c}</span>
        </li>
      ))}
    </ul>
  );
}

function GraphPanel() {
  return (
    <svg viewBox="0 0 360 260" className="h-full w-full">
      <defs>
        <linearGradient id="vhEdge" x1="0" y1="0" x2="360" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" /><stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <radialGradient id="vhNode" cx="0.5" cy="0.4" r="0.7">
          <stop stopColor="#38BDF8" /><stop offset="1" stopColor="#2563EB" />
        </radialGradient>
        <radialGradient id="vhRisk" cx="0.5" cy="0.4" r="0.7">
          <stop stopColor="#FF8A8A" /><stop offset="1" stopColor="#FB5B5B" />
        </radialGradient>
      </defs>
      <g stroke="url(#vhEdge)" strokeWidth="1.5" opacity="0.5">
        <line x1="70" y1="40" x2="50" y2="130" /><line x1="70" y1="40" x2="180" y2="120" />
        <line x1="290" y1="40" x2="180" y2="120" /><line x1="290" y1="40" x2="310" y2="130" />
        <line x1="50" y1="130" x2="185" y2="215" /><line x1="180" y1="120" x2="185" y2="215" /><line x1="310" y1="130" x2="185" y2="215" />
      </g>
      <g fill="url(#vhNode)">
        <circle cx="50" cy="130" r="8" /><circle cx="180" cy="120" r="8" /><circle cx="310" cy="130" r="8" />
      </g>
      <g fill="#10151F" stroke="url(#vhEdge)" strokeWidth="1.5">
        <circle cx="70" cy="40" r="6" /><circle cx="290" cy="40" r="6" />
      </g>
      <circle cx="185" cy="215" r="13" fill="url(#vhRisk)" />
      <text x="185" y="242" textAnchor="middle" style={{ fill: '#FF9B9B', fontSize: 9, fontFamily: 'var(--font-mono), monospace' }}>
        shared substrate · single point of failure
      </text>
    </svg>
  );
}

function RegisterPanel() {
  const rows = [
    ['OpenAI', 'API', 'High', 'RT.02.01'],
    ['Azure', 'Cloud', 'Critical', 'RT.02.01'],
    ['Datadog', 'Monitoring', 'Important', 'RT.02.01'],
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-4 bg-background/50 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">
        <span>Provider</span><span>Service</span><span>Criticality</span><span>Register</span>
      </div>
      {rows.map((r) => (
        <div key={r[0]} className="grid grid-cols-4 border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
          <span className="text-foreground">{r[0]}</span><span>{r[1]}</span>
          <span>{r[2]}</span><span className="font-mono text-xs text-primary/80">{r[3]}</span>
        </div>
      ))}
    </div>
  );
}
