'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Gauge,
  ListChecks,
  Lock,
  Network,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';

import { PricingSection } from '@/components/marketing/pricing-section';
import { ConcentrationGraphHero } from '@/components/marketing/ConcentrationGraphHero';
import { VideoHero } from '@/components/marketing/VideoHero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import { Button } from '@/shared/ui/button';
import { Logo } from '@/shared/ui/logo';

export function LandingPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link href="/pricing">
              <Button variant="ghost">{t('common.pricing')}</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">{t('common.signIn')}</Button>
            </Link>
            <Link href="/register">
              <Button>{t('common.getStarted')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — the message + the live concentration graph */}
      <section className="container mx-auto px-4 pt-20 pb-24">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 text-xs text-muted-foreground mb-6">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {t('landing.badge')}
            </div>
            <h1 className="font-display text-4xl md:text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight mb-6 text-balance">
              {t('landing.heroTitle')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
              {t('landing.heroSubtitle')}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/register">
                <Button size="lg">{t('common.startFree')}</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">{t('common.signIn')}</Button>
              </Link>
            </div>
          </motion.div>

          <div className="relative">
            <div
              className="absolute -inset-8 -z-10 rounded-full opacity-40 blur-3xl"
              style={{ background: 'radial-gradient(closest-side, hsl(var(--primary)/0.25), transparent)' }}
            />
            <ConcentrationGraphHero className="mx-auto max-w-md" />
          </div>
        </div>
      </section>

      <VideoHero />

      {/* By the numbers — regulator-proven market validation */}
      <section className="border-y border-border/60 bg-card/40 py-20">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2">
            {t('landing.stats.heading')}
          </h2>
          <p className="text-muted-foreground mb-14 max-w-2xl mx-auto">{t('landing.stats.subtitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {[
              { v: 'landing.stats.checks', l: 'landing.stats.checksLabel', accent: false },
              { v: 'landing.stats.pass', l: 'landing.stats.passLabel', accent: false },
              { v: 'landing.stats.fail', l: 'landing.stats.failLabel', accent: true },
            ].map(({ v, l, accent }) => (
              <div key={v}>
                <div
                  className={`font-display text-5xl md:text-6xl font-bold tracking-tight mb-2 ${accent ? 'text-primary' : 'text-foreground'}`}
                >
                  {t(v)}
                </div>
                <p className="text-sm text-muted-foreground">{t(l)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-12 max-w-2xl mx-auto">{t('landing.stats.footnote')}</p>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {t('landing.problem.heading')}
          </h2>
          <p className="text-muted-foreground mb-12 text-lg max-w-2xl">{t('landing.problem.subtitle')}</p>
          <div className="grid sm:grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {['manual', 'slow', 'endless', 'accountable'].map((k) => (
              <div key={k} className="flex gap-3 bg-card p-6">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.problem.points.${k}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — concentration graph is featured (the moat) */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-center mb-14">
          {t('landing.featuresHeading')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            featured
            icon={<Network className="h-8 w-8" />}
            title={t('landing.features.concentration.title')}
            description={t('landing.features.concentration.desc')}
          />
          <FeatureCard icon={<FileSearch className="h-7 w-7" />} title={t('landing.features.gapAnalysis.title')} description={t('landing.features.gapAnalysis.desc')} />
          <FeatureCard icon={<ClipboardCheck className="h-7 w-7" />} title={t('landing.features.questionnaires.title')} description={t('landing.features.questionnaires.desc')} />
          <FeatureCard icon={<Bot className="h-7 w-7" />} title={t('landing.features.copilot.title')} description={t('landing.features.copilot.desc')} />
          <FeatureCard icon={<Bell className="h-7 w-7" />} title={t('landing.features.monitoring.title')} description={t('landing.features.monitoring.desc')} />
          <FeatureCard icon={<FileSpreadsheet className="h-7 w-7" />} title={t('landing.features.roi.title')} description={t('landing.features.roi.desc')} />
          <FeatureCard icon={<Gauge className="h-7 w-7" />} title={t('landing.features.score.title')} description={t('landing.features.score.desc')} />
          <FeatureCard icon={<ListChecks className="h-7 w-7" />} title={t('landing.features.riskRegister.title')} description={t('landing.features.riskRegister.desc')} />
          <FeatureCard icon={<FileText className="h-7 w-7" />} title={t('landing.features.reports.title')} description={t('landing.features.reports.desc')} />
          <FeatureCard icon={<Lock className="h-7 w-7" />} title={t('landing.features.security.title')} description={t('landing.features.security.desc')} />
        </div>
      </section>

      {/* Differentiation */}
      <section className="container mx-auto px-4 py-24">
        <div className="max-w-2xl mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {t('landing.differentiation.heading')}
          </h2>
          <p className="text-muted-foreground text-lg">{t('landing.differentiation.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { k: 'grc', icon: <Database className="h-6 w-6" />, highlight: false },
            { k: 'chatgpt', icon: <Bot className="h-6 w-6" />, highlight: false },
            { k: 'retrieva', icon: <Sparkles className="h-6 w-6" />, highlight: true },
          ].map(({ k, icon, highlight }) => (
            <div
              key={k}
              className={
                highlight
                  ? 'rounded-2xl border border-primary/50 bg-primary/[0.07] p-6 ring-1 ring-primary/20'
                  : 'rounded-2xl border border-border bg-card/50 p-6'
              }
            >
              <div className={`mb-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
              <h3 className="font-display text-lg font-semibold mb-2">{t(`landing.differentiation.${k}.title`)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`landing.differentiation.${k}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-source evidence */}
      <section className="border-y border-border/60 bg-card/40 py-24">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-4">
              {t('landing.ingestionHeading')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl">{t('landing.ingestionSubtitle')}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display font-semibold">{t('landing.ingestionCardTitle')}</h3>
                <p className="text-xs text-muted-foreground">{t('landing.ingestionCardSubtitle')}</p>
              </div>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground mb-4">
              {[
                t('landing.ingestionItems.files'),
                t('landing.ingestionItems.questionnaire'),
                t('landing.ingestionItems.gap'),
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {t('landing.ingestionFootnote')}
            </p>
          </div>
        </div>
      </section>

      {/* How it works — a real sequence, so numbered */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-center mb-14">
            {t('landing.howItWorksHeading')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 max-w-6xl mx-auto">
            <StepCard number="1" icon={<Database className="h-6 w-6" />} title={t('landing.steps.index.title')} description={t('landing.steps.index.desc')} />
            <StepCard number="2" icon={<ShieldCheck className="h-6 w-6" />} title={t('landing.steps.assess.title')} description={t('landing.steps.assess.desc')} />
            <StepCard number="3" icon={<ClipboardCheck className="h-6 w-6" />} title={t('landing.steps.invite.title')} description={t('landing.steps.invite.desc')} />
            <StepCard number="4" icon={<Bot className="h-6 w-6" />} title={t('landing.steps.ask.title')} description={t('landing.steps.ask.desc')} />
            <StepCard number="5" icon={<FileSpreadsheet className="h-6 w-6" />} title={t('landing.steps.export.title')} description={t('landing.steps.export.desc')} />
          </div>
        </div>
      </section>

      {/* Regulatory credibility */}
      <section className="container mx-auto px-4 py-24 max-w-3xl">
        <ScrollText className="h-9 w-9 text-primary mb-4" />
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">{t('landing.credibility.heading')}</h2>
        <p className="text-muted-foreground mb-10 text-lg">{t('landing.credibility.subtitle')}</p>
        <ul className="space-y-3">
          {['grounded', 'cited', 'signoff'].map((k) => (
            <li key={k} className="flex gap-3 rounded-2xl border border-border bg-card/50 p-5">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t(`landing.credibility.points.${k}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Security & data */}
      <section className="border-y border-border/60 bg-card/40 py-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="max-w-2xl mb-12">
            <ShieldCheck className="h-9 w-9 text-primary mb-4" />
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">{t('landing.security.heading')}</h2>
            <p className="text-muted-foreground text-lg">{t('landing.security.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              { k: 'isolation', icon: <Lock className="h-5 w-5" /> },
              { k: 'selfHosted', icon: <Server className="h-5 w-5" /> },
              { k: 'encryption', icon: <ShieldCheck className="h-5 w-5" /> },
              { k: 'erasure', icon: <Database className="h-5 w-5" /> },
            ].map(({ k, icon }) => (
              <div key={k} className="flex gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="text-primary shrink-0">{icon}</span>
                <div>
                  <h3 className="font-display font-semibold text-sm mb-1">
                    {t(`landing.security.points.${k}.title`)}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`landing.security.points.${k}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      {/* FAQ */}
      <section className="container mx-auto px-4 py-24 max-w-3xl">
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">
          {t('landing.faq.heading')}
        </h2>
        <div className="space-y-3">
          {['data', 'replace', 'frameworks', 'language', 'speed'].map((k) => (
            <details key={k} className="group rounded-2xl border border-border bg-card/50 p-5 open:border-primary/30">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display font-medium">
                {t(`landing.faq.items.${k}.q`)}
                <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t(`landing.faq.items.${k}.a`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA — dark panel with graph glow */}
      <section className="container mx-auto px-4 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card p-12 text-center">
          <div
            className="absolute -top-24 left-1/2 -translate-x-1/2 -z-0 h-64 w-[36rem] max-w-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(closest-side, hsl(var(--primary)/0.22), transparent)' }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-4">
              {t('landing.finalCta.heading')}
            </h2>
            <p className="text-muted-foreground mb-8 text-lg max-w-2xl mx-auto">
              {t('landing.finalCta.subtitle')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="gap-2">
                  {t('landing.finalCta.primary')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">{t('landing.finalCta.secondary')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Logo className="mb-2" />
              <p className="text-sm text-muted-foreground">{t('landing.footer.tagline')}</p>
            </div>
            <div>
              <div className="font-display font-semibold text-sm mb-3">{t('landing.footer.product')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/register" className="hover:text-foreground">{t('landing.footer.getStarted')}</Link></li>
                <li><Link href="/login" className="hover:text-foreground">{t('landing.footer.signin')}</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-display font-semibold text-sm mb-3">{t('landing.footer.resources')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="https://andrelair-platform.github.io/retrieva/" target="_blank" rel="noreferrer" className="hover:text-foreground">
                    {t('landing.footer.docs')}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-display font-semibold text-sm mb-3">{t('landing.footer.company')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="mailto:contact@retrieva.online" className="hover:text-foreground">{t('landing.footer.contact')}</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Retrieva — {t('landing.footer.rights')}
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  featured = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <div
      className={
        featured
          ? 'md:col-span-2 lg:col-span-1 lg:row-span-2 rounded-2xl border border-primary/50 bg-primary/[0.06] p-6 ring-1 ring-primary/15 flex flex-col justify-center'
          : 'rounded-2xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/40'
      }
    >
      <div className={`mb-4 ${featured ? 'text-primary' : 'text-primary/80'}`}>{icon}</div>
      <h3 className={`font-display font-semibold mb-2 ${featured ? 'text-xl' : 'text-lg'}`}>{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/40">
      <div className="absolute top-4 right-4 font-display text-sm font-bold text-primary/30">{number}</div>
      <div className="mb-4 text-primary/80">{icon}</div>
      <h3 className="font-display text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
