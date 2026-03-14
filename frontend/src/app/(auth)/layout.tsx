import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* ── Left panel — brand identity ── */}
      <div className="relative hidden lg:flex flex-col overflow-hidden bg-sidebar">

        {/* Fine grid texture */}
        <div className="absolute inset-0 bg-grid-pattern opacity-100" />

        {/* Ambient glow */}
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-sidebar-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sidebar-primary/8 blur-3xl" />

        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-3 p-10">
          <ShieldCheck className="h-7 w-7 text-sidebar-primary" />
          <span className="font-display text-xl font-semibold text-sidebar-foreground tracking-tight">
            Retrieva
          </span>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-12">
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-primary">
                EU Digital Operational Resilience Act
              </p>
            </div>
            <blockquote className="space-y-3">
              <p className="font-display text-4xl font-light leading-[1.2] text-sidebar-foreground/90">
                Compliance without intelligence<br />
                is just theatre.
              </p>
              <p className="text-sm text-sidebar-foreground/40 leading-relaxed max-w-xs">
                Retrieva automates DORA Article 28 vendor risk assessment,
                so your compliance team can focus on decisions, not documents.
              </p>
            </blockquote>

            {/* DORA pillars */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              {[
                { code: 'Art. 28', label: 'Vendor Classification' },
                { code: 'Art. 30', label: 'Contractual Clauses' },
                { code: 'Art. 31', label: 'Critical ICT Providers' },
                { code: 'Art. 32', label: 'Exit Strategies' },
              ].map(({ code, label }) => (
                <div key={code} className="rounded-sm border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
                  <p className="font-mono text-[10px] text-sidebar-primary mb-0.5">{code}</p>
                  <p className="text-xs text-sidebar-foreground/50">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-10 py-6 border-t border-sidebar-border">
          <p className="text-[11px] text-sidebar-foreground/25">
            Regulation (EU) 2022/2554 · In force since 17 January 2025
          </p>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12 bg-background">

        {/* Mobile wordmark */}
        <div className="lg:hidden mb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-display text-2xl font-semibold text-foreground">Retrieva</span>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">DORA compliance assessment</p>
        </div>

        <div className="w-full max-w-sm space-y-8">
          {children}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
