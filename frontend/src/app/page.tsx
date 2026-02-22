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
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={<FileSearch className="h-8 w-8" />}
            title="Automated Gap Analysis"
            description="Upload vendor ICT documentation and get a structured DORA compliance gap report in minutes."
          />
          <FeatureCard
            icon={<Database className="h-8 w-8" />}
            title="Multi-Source Ingestion"
            description="Connect Notion, upload files, or crawl URLs — all sources feed one unified knowledge base."
          />
          <FeatureCard
            icon={<Bot className="h-8 w-8" />}
            title="DORA Copilot"
            description="Ask compliance questions in natural language. The agentic copilot searches your docs and DORA articles."
          />
          <FeatureCard
            icon={<Lock className="h-8 w-8" />}
            title="Enterprise-Grade Security"
            description="Workspace isolation, PII detection, audit logging, and encrypted secrets — built for regulated industries."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              icon={<Database className="h-6 w-6" />}
              title="Connect Sources"
              description="Link your Notion workspace or upload vendor contracts, policies, and ICT documentation."
            />
            <StepCard
              number="2"
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Run Assessment"
              description="Our AI agent analyses documents against DORA obligations and identifies specific compliance gaps."
            />
            <StepCard
              number="3"
              icon={<Bot className="h-6 w-6" />}
              title="Ask the Copilot"
              description="Query your compliance posture in plain language and download structured gap reports."
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
