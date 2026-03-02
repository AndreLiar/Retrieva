'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Billing = 'monthly' | 'annual';

interface Plan {
  name: string;
  monthly: string;
  annual: string;
  monthlyRaw: number | null;
  annualRaw: number | null;
  vendors: string;
  members: string;
  dataSources: string;
  support: string;
  trial: string;
  highlighted: boolean;
  badge?: string;
  ctaLabel: string;
  ctaHref: string;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    monthly: '€199',
    annual: '€159',
    monthlyRaw: 199,
    annualRaw: 159,
    vendors: 'Up to 10',
    members: '3',
    dataSources: 'File, URL',
    support: 'Email',
    trial: '20 days',
    highlighted: false,
    ctaLabel: 'Start free trial',
    ctaHref: '/register',
  },
  {
    name: 'Professional',
    monthly: '€499',
    annual: '€399',
    monthlyRaw: 499,
    annualRaw: 399,
    vendors: 'Up to 50',
    members: '10',
    dataSources: 'File, URL, Confluence',
    support: 'Priority email',
    trial: '20 days',
    highlighted: true,
    badge: 'Most Popular',
    ctaLabel: 'Start free trial',
    ctaHref: '/register',
  },
  {
    name: 'Business',
    monthly: '€999',
    annual: '€799',
    monthlyRaw: 999,
    annualRaw: 799,
    vendors: 'Up to 150',
    members: '30',
    dataSources: 'All sources',
    support: 'Slack + SLA',
    trial: '20 days',
    highlighted: false,
    ctaLabel: 'Start free trial',
    ctaHref: '/register',
  },
  {
    name: 'Enterprise',
    monthly: 'Custom',
    annual: 'Custom',
    monthlyRaw: null,
    annualRaw: null,
    vendors: 'Unlimited',
    members: 'Unlimited',
    dataSources: 'All + custom',
    support: 'Dedicated CSM',
    trial: 'POC',
    highlighted: false,
    ctaLabel: 'Contact Sales',
    ctaHref: '/contact',
  },
];

interface FeatureRowProps {
  label: string;
  value: string | React.ReactNode;
}

function FeatureRow({ label, value }: FeatureRowProps) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[55%]">
        {value}
      </span>
    </div>
  );
}

const checkMark = <Check className="h-4 w-4 text-green-500 ml-auto" />;

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <section className="container mx-auto px-4 py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">Simple, transparent pricing</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
          20-day free trial on all plans. No credit card required to start.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center rounded-full border p-1 bg-muted/50">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              billing === 'monthly'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
              billing === 'annual'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annual
            <span className="text-xs font-semibold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* 4-card grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan, index) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className={`relative rounded-xl p-6 flex flex-col ${
              plan.highlighted
                ? 'ring-2 ring-primary bg-card shadow-lg'
                : 'border bg-card'
            }`}
          >
            {/* Most Popular badge */}
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground whitespace-nowrap">
                {plan.badge}
              </span>
            )}

            {/* Plan name */}
            <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>

            {/* Price */}
            <div className="mb-6">
              {plan.monthlyRaw === null ? (
                <div className="text-4xl font-bold">Custom</div>
              ) : (
                <>
                  <div className="text-4xl font-bold">
                    {billing === 'monthly' ? plan.monthly : plan.annual}
                    <span className="text-base font-normal text-muted-foreground">/mo</span>
                  </div>
                  {billing === 'annual' && (
                    <p className="text-xs text-muted-foreground mt-1">billed annually</p>
                  )}
                </>
              )}
            </div>

            {/* Feature rows */}
            <div className="flex-1 space-y-0">
              <FeatureRow label="Vendors managed" value={plan.vendors} />
              <FeatureRow label="Team members" value={plan.members} />
              <FeatureRow label="DORA gap assessments" value="Unlimited" />
              <FeatureRow label="Vendor questionnaires" value="Unlimited" />
              <FeatureRow label="AI Copilot queries" value="Unlimited" />
              <FeatureRow label="Data sources" value={plan.dataSources} />
              <FeatureRow label="EBA Excel export" value={checkMark} />
              <FeatureRow label="Cert/contract alerts" value={checkMark} />
              <FeatureRow label="Support" value={plan.support} />
              <FeatureRow label="Free trial" value={plan.trial} />
            </div>

            {/* CTA */}
            <Link href={plan.ctaHref} className="mt-6">
              <Button
                size="lg"
                variant={plan.highlighted ? 'default' : 'outline'}
                className="w-full"
              >
                {plan.ctaLabel}
              </Button>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
