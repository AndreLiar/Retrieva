'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Database,
  ArrowRight,
  FileSearch,
  Bot,
  Lock,
  Plug,
  Globe,
  Upload,
  CheckCircle2,
  Bell,
  FileSpreadsheet,
  ClipboardCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth-store';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  // Redirect authenticated users to the primary feature
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.push('/assessments');
    }
  }, [isAuthenticated, isInitialized, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Retrieva</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
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

      {/* Features */}
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

      {/* Connect Anything */}
      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-4">Connect any knowledge source</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Simple built-in connectors for common tools. Open MCP protocol for everything else.
              Both paths feed the same high-quality RAG pipeline.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Native */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-lg border bg-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Native Integrations</h3>
                  <p className="text-xs text-muted-foreground">Zero infrastructure required</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                {[
                  'Notion workspace sync',
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

            {/* MCP */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-lg border bg-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  <Plug className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">MCP Protocol</h3>
                  <p className="text-xs text-muted-foreground">Connect anything, your way</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                {[
                  'GitHub, Jira, Slack, Google Drive',
                  'Notion via official MCP server',
                  'Internal wikis & proprietary systems',
                  'Any custom MCP-compatible server',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground border-t pt-3">
                Run your own MCP server — Retrieva indexes it automatically.
              </p>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-sm text-muted-foreground mt-8 flex items-center justify-center gap-2"
          >
            <Globe className="h-4 w-4" />
            As the MCP ecosystem grows, Retrieva gains new source types with zero backend changes.
          </motion.p>
        </div>
      </section>

      {/* How it works */}
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
              title="Send Questionnaire"
              description="Generate tailored vendor questionnaires. Responses are scored automatically by the LLM judge."
            />
            <StepCard
              number="4"
              icon={<Bell className="h-6 w-6" />}
              title="Stay Ahead of Deadlines"
              description="Receive automated alerts for certification expiry, contract renewal, and overdue annual reviews."
            />
            <StepCard
              number="5"
              icon={<FileSpreadsheet className="h-6 w-6" />}
              title="Export Register of Information"
              description="Download the EBA Article 28(3) RoI workbook with a single click. Ready to submit to regulators."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to simplify DORA compliance?</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Join compliance teams already using Retrieva to automate third-party ICT risk assessments
          and meet their DORA obligations.
        </p>
        <Link href="/register">
          <Button size="lg" className="gap-2">
            Create Free Account <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>
            &copy; {new Date().getFullYear()} Retrieva.{' '}
            <span className="opacity-60">
              Built for DORA (Regulation EU 2022/2554) compliance.
            </span>
          </p>
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
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="p-6 rounded-lg border bg-card"
    >
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
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
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
        {number}
      </div>
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-primary">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
