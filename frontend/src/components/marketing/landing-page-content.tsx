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
import { VideoHero } from '@/components/marketing/VideoHero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import { Button } from '@/shared/ui/button';
import { Logo } from '@/shared/ui/logo';

export function LandingPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
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

      <section className="container mx-auto px-4 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-muted text-sm text-muted-foreground mb-6">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {t('landing.badge')}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            {t('landing.heroTitle')}{' '}
            <span className="text-primary">{t('landing.heroTitleAccent')}</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                {t('common.startFree')} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                {t('common.signIn')}
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <VideoHero />

      {/* By the numbers — regulator-proven market validation (WHOOP-style stat band) */}
      <section className="bg-primary/5 border-y py-20">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">{t('landing.stats.heading')}</h2>
          <p className="text-muted-foreground mb-12 max-w-2xl mx-auto">{t('landing.stats.subtitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { v: 'landing.stats.checks', l: 'landing.stats.checksLabel', accent: false },
              { v: 'landing.stats.pass', l: 'landing.stats.passLabel', accent: false },
              { v: 'landing.stats.fail', l: 'landing.stats.failLabel', accent: true },
            ].map(({ v, l, accent }) => (
              <div key={v}>
                <div className={`text-5xl md:text-6xl font-bold tracking-tight mb-2 ${accent ? 'text-primary' : ''}`}>
                  {t(v)}
                </div>
                <p className="text-sm text-muted-foreground">{t(l)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/80 mt-10 max-w-2xl mx-auto">{t('landing.stats.footnote')}</p>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">{t('landing.problem.heading')}</h2>
          <p className="text-muted-foreground mb-12 text-lg">{t('landing.problem.subtitle')}</p>
          <div className="grid sm:grid-cols-2 gap-6 text-left">
            {['manual', 'slow', 'endless', 'accountable'].map((k) => (
              <div key={k} className="flex gap-3 rounded-xl border bg-card p-5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.problem.points.${k}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-12">{t('landing.featuresHeading')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Network className="h-8 w-8" />}
            title={t('landing.features.concentration.title')}
            description={t('landing.features.concentration.desc')}
          />
          <FeatureCard
            icon={<FileSearch className="h-8 w-8" />}
            title={t('landing.features.gapAnalysis.title')}
            description={t('landing.features.gapAnalysis.desc')}
          />
          <FeatureCard
            icon={<ClipboardCheck className="h-8 w-8" />}
            title={t('landing.features.questionnaires.title')}
            description={t('landing.features.questionnaires.desc')}
          />
          <FeatureCard
            icon={<Bot className="h-8 w-8" />}
            title={t('landing.features.copilot.title')}
            description={t('landing.features.copilot.desc')}
          />
          <FeatureCard
            icon={<Bell className="h-8 w-8" />}
            title={t('landing.features.monitoring.title')}
            description={t('landing.features.monitoring.desc')}
          />
          <FeatureCard
            icon={<FileSpreadsheet className="h-8 w-8" />}
            title={t('landing.features.roi.title')}
            description={t('landing.features.roi.desc')}
          />
          <FeatureCard
            icon={<Gauge className="h-8 w-8" />}
            title={t('landing.features.score.title')}
            description={t('landing.features.score.desc')}
          />
          <FeatureCard
            icon={<ListChecks className="h-8 w-8" />}
            title={t('landing.features.riskRegister.title')}
            description={t('landing.features.riskRegister.desc')}
          />
          <FeatureCard
            icon={<FileText className="h-8 w-8" />}
            title={t('landing.features.reports.title')}
            description={t('landing.features.reports.desc')}
          />
          <FeatureCard
            icon={<Lock className="h-8 w-8" />}
            title={t('landing.features.security.title')}
            description={t('landing.features.security.desc')}
          />
        </div>
      </section>

      {/* Differentiation */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">{t('landing.differentiation.heading')}</h2>
          <p className="text-muted-foreground text-lg">{t('landing.differentiation.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { k: 'grc', icon: <Database className="h-6 w-6" />, highlight: false },
            { k: 'chatgpt', icon: <Bot className="h-6 w-6" />, highlight: false },
            { k: 'retrieva', icon: <Sparkles className="h-6 w-6" />, highlight: true },
          ].map(({ k, icon, highlight }) => (
            <div
              key={k}
              className={`rounded-xl border p-6 ${highlight ? 'border-primary bg-primary/5' : 'bg-card'}`}
            >
              <div className={`mb-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
              <h3 className="text-lg font-semibold mb-2">{t(`landing.differentiation.${k}.title`)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`landing.differentiation.${k}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-4">{t('landing.ingestionHeading')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t('landing.ingestionSubtitle')}
            </p>
          </motion.div>

          <div className="max-w-lg mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-lg border bg-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('landing.ingestionCardTitle')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('landing.ingestionCardSubtitle')}
                  </p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                {[
                  t('landing.ingestionItems.files'),
                  t('landing.ingestionItems.questionnaire'),
                  t('landing.ingestionItems.gap'),
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground border-t pt-3">
                {t('landing.ingestionFootnote')}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">{t('landing.howItWorksHeading')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
            <StepCard
              number="1"
              icon={<Database className="h-6 w-6" />}
              title={t('landing.steps.index.title')}
              description={t('landing.steps.index.desc')}
            />
            <StepCard
              number="2"
              icon={<ShieldCheck className="h-6 w-6" />}
              title={t('landing.steps.assess.title')}
              description={t('landing.steps.assess.desc')}
            />
            <StepCard
              number="3"
              icon={<ClipboardCheck className="h-6 w-6" />}
              title={t('landing.steps.invite.title')}
              description={t('landing.steps.invite.desc')}
            />
            <StepCard
              number="4"
              icon={<Bot className="h-6 w-6" />}
              title={t('landing.steps.ask.title')}
              description={t('landing.steps.ask.desc')}
            />
            <StepCard
              number="5"
              icon={<FileSpreadsheet className="h-6 w-6" />}
              title={t('landing.steps.export.title')}
              description={t('landing.steps.export.desc')}
            />
          </div>
        </div>
      </section>

      {/* Regulatory credibility */}
      <section className="container mx-auto px-4 py-24 max-w-3xl text-center">
        <ScrollText className="mx-auto h-10 w-10 text-primary mb-4" />
        <h2 className="text-3xl font-bold mb-4">{t('landing.credibility.heading')}</h2>
        <p className="text-muted-foreground mb-10 text-lg">{t('landing.credibility.subtitle')}</p>
        <ul className="space-y-4 text-left">
          {['grounded', 'cited', 'signoff'].map((k) => (
            <li key={k} className="flex gap-3 rounded-xl border bg-card p-5">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <span className="text-sm text-muted-foreground leading-relaxed">
                {t(`landing.credibility.points.${k}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Security & data */}
      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary mb-4" />
            <h2 className="text-3xl font-bold mb-4">{t('landing.security.heading')}</h2>
            <p className="text-muted-foreground text-lg">{t('landing.security.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { k: 'isolation', icon: <Lock className="h-5 w-5" /> },
              { k: 'selfHosted', icon: <Server className="h-5 w-5" /> },
              { k: 'encryption', icon: <ShieldCheck className="h-5 w-5" /> },
              { k: 'erasure', icon: <Database className="h-5 w-5" /> },
            ].map(({ k, icon }) => (
              <div key={k} className="flex gap-3 rounded-xl border bg-card p-5">
                <span className="text-primary shrink-0">{icon}</span>
                <div>
                  <h3 className="font-semibold text-sm mb-1">
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
        <h2 className="text-3xl font-bold text-center mb-12">{t('landing.faq.heading')}</h2>
        <div className="space-y-3">
          {['data', 'replace', 'frameworks', 'language', 'speed'].map((k) => (
            <details key={k} className="group rounded-xl border bg-card p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {t(`landing.faq.items.${k}.q`)}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t(`landing.faq.items.${k}.a`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 pb-24">
        <div className="rounded-2xl border bg-primary/5 p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">{t('landing.finalCta.heading')}</h2>
          <p className="text-muted-foreground mb-8 text-lg max-w-2xl mx-auto">
            {t('landing.finalCta.subtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <Button size="lg">
                {t('landing.finalCta.primary')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                {t('landing.finalCta.secondary')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Logo className="mb-2" />
              <p className="text-sm text-muted-foreground">{t('landing.footer.tagline')}</p>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">{t('landing.footer.product')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/register" className="hover:text-foreground">
                    {t('landing.footer.getStarted')}
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-foreground">
                    {t('landing.footer.signin')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">{t('landing.footer.resources')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="https://andrelair-platform.github.io/retrieva/"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground"
                  >
                    {t('landing.footer.docs')}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">{t('landing.footer.company')}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="mailto:contact@retrieva.online" className="hover:text-foreground">
                    {t('landing.footer.contact')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
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
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="rounded-xl border bg-card p-6 text-left shadow-sm"
    >
      <div className="mb-4 text-primary">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
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
    <motion.div
      whileHover={{ y: -4 }}
      className="relative rounded-xl border bg-card p-6 text-left shadow-sm"
    >
      <div className="absolute top-4 right-4 text-xs font-semibold text-muted-foreground/50">
        {number}
      </div>
      <div className="mb-4 text-primary">{icon}</div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}
