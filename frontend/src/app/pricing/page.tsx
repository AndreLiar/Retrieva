'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { PricingSection } from '@/components/marketing/pricing-section';

const FAQ_ITEMS = [
  {
    question: 'Can I change plans later?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time from your billing settings. Changes take effect immediately.',
  },
  {
    question: 'What happens after the trial?',
    answer: "At the end of your 20-day trial you'll be prompted to add a payment method to continue. We never auto-charge — your data stays safe until you decide.",
  },
  {
    question: 'Is there an annual discount?',
    answer: 'Yes — all paid plans are 20% cheaper when billed annually. You can switch between monthly and annual billing at any time from your billing settings.',
  },
  {
    question: 'How does the Enterprise POC work?',
    answer: 'Contact our sales team and we will scope a proof-of-concept tailored to your organisation. No commitment required — the POC is designed to validate fit before you sign.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Retrieva</span>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/pricing">
              <Button variant="ghost" className="font-semibold">
                Pricing
              </Button>
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

      {/* Pricing section */}
      <PricingSection />

      {/* FAQ */}
      <section className="container mx-auto px-4 py-16 max-w-3xl">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently asked questions</h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group border rounded-lg overflow-hidden"
            >
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer font-medium select-none list-none">
                {item.question}
                <span className="text-muted-foreground transition-transform group-open:rotate-180 ml-4 shrink-0">
                  ▾
                </span>
              </summary>
              <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
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
