'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { PricingSection } from '@/components/marketing/pricing-section';
import { VideoHero } from '@/components/marketing/VideoHero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/shared/ui/button';

export function LandingPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Retrieva</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
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
            DORA Regulation (EU) 2022/2554
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            DORA Compliance Intelligence{' '}
            <span className="text-primary">for Financial Entities</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Automate third-party ICT risk assessments, identify compliance gaps against DORA
            requirements, and get instant answers from an AI copilot trained on your documentation.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Sign In
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <VideoHero />

      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-12">
          Everything you need to meet DORA obligations
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<FileSearch className="h-8 w-8" />}
            title="Automated Gap Analysis"
            description="Upload vendor ICT documentation and get a structured DORA compliance gap report in minutes."
          />
          <FeatureCard
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="Vendor Questionnaires"
            description="Auto-generate security questionnaires, invite vendors to respond, and get LLM-scored compliance results instantly."
          />
          <FeatureCard
            icon={<Bot className="h-8 w-8" />}
            title="DORA Copilot"
            description="Ask compliance questions in natural language. The agentic copilot searches your docs and DORA articles."
          />
          <FeatureCard
            icon={<Bell className="h-8 w-8" />}
            title="Monitoring Alerts"
            description="Automated 24-hour alerts for certification expiry (90/30/7 days), contract renewal, and overdue assessments."
          />
          <FeatureCard
            icon={<FileSpreadsheet className="h-8 w-8" />}
            title="Register of Information"
            description="One-click EBA-compliant DORA Article 28(3) XLSX export — RT.01.01 to RT.04.01 sheets generated automatically."
          />
          <FeatureCard
            icon={<Lock className="h-8 w-8" />}
            title="Enterprise-Grade Security"
            description="Workspace isolation, PII detection, audit logging, and encrypted secrets — built for regulated industries."
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
            <h2 className="text-3xl font-bold mb-4">Connect your knowledge sources</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Upload documents, crawl URLs, or sync from Confluence — all feeding the same
              high-quality RAG pipeline.
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
                  <h3 className="font-semibold">Built-in Connectors</h3>
                  <p className="text-xs text-muted-foreground">Zero infrastructure required</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                {[
                  'File upload — PDF, DOCX, XLSX',
                  'Web URL crawling',
                  'Confluence Cloud (direct API)',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground border-t pt-3">
                Fill in a form — Retrieva handles the rest.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
            <StepCard
              number="1"
              icon={<Database className="h-6 w-6" />}
              title="Index Documentation"
              description="Upload vendor contracts, ICT policies, and audit reports. Retrieva parses, chunks, and embeds them automatically."
            />
            <StepCard
              number="2"
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Run DORA Assessment"
              description="AI analyses documents against each DORA article and classifies coverage as covered, partial, or missing."
            />
            <StepCard
              number="3"
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Invite Vendors"
              description="Send tokenised due diligence questionnaires and get scored responses back without vendor logins."
            />
            <StepCard
              number="4"
              icon={<Bot className="h-6 w-6" />}
              title="Ask the Copilot"
              description="Query your knowledge base in natural language and get cited answers grounded in your own documentation."
            />
            <StepCard
              number="5"
              icon={<FileSpreadsheet className="h-6 w-6" />}
              title="Export Evidence"
              description="Generate regulator-ready outputs including the Register of Information and gap remediation artefacts."
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
