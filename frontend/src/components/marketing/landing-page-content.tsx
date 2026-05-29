'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Gauge,
  ListChecks,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { PricingSection } from '@/components/marketing/pricing-section';
import { VideoHero } from '@/components/marketing/VideoHero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import { Button } from '@/shared/ui/button';

export function LandingPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Retrieva</span>
          </div>
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

      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-12">{t('landing.featuresHeading')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                  t('landing.ingestionItems.parsing'),
                  t('landing.ingestionItems.selfHosted'),
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

      <PricingSection />
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
