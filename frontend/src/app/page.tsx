'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Zap,
  Shield,
  Database,
  ArrowRight,
  Sparkles,
  BookOpen,
  Users
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth-store';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  // Redirect authenticated users to chat
  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.push('/chat');
    }
  }, [isAuthenticated, isInitialized, router]);

  // Show loading while checking auth
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If authenticated, show nothing while redirecting
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">RAG Platform</span>
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

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Your Knowledge Base,{' '}
            <span className="text-primary">Supercharged with AI</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Connect your Notion workspace and get instant, accurate answers from your documents.
            Powered by advanced RAG technology.
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

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-12">
          Everything you need to unlock your knowledge
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={<MessageSquare className="h-8 w-8" />}
            title="Smart Q&A"
            description="Ask questions in natural language and get accurate answers with source citations."
          />
          <FeatureCard
            icon={<Database className="h-8 w-8" />}
            title="Notion Integration"
            description="Connect your Notion workspace and automatically sync your documents."
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Fast & Accurate"
            description="Get instant responses powered by semantic search and LLM technology."
          />
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            title="Secure & Private"
            description="Your data stays private with enterprise-grade security and encryption."
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/50 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              icon={<BookOpen className="h-6 w-6" />}
              title="Connect Notion"
              description="Link your Notion workspace with one click using OAuth."
            />
            <StepCard
              number="2"
              icon={<Zap className="h-6 w-6" />}
              title="Auto-Sync"
              description="Your documents are automatically indexed and kept up to date."
            />
            <StepCard
              number="3"
              icon={<MessageSquare className="h-6 w-6" />}
              title="Ask Questions"
              description="Start asking questions and get instant, sourced answers."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to get started?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Join teams who are already using RAG Platform to unlock insights from their knowledge base.
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
          <p>&copy; {new Date().getFullYear()} RAG Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
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
  description
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
