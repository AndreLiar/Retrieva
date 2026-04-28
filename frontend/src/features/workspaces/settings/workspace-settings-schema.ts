'use client';

import { z } from 'zod';

export const workspaceSettingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  vendorTier: z.enum(['critical', 'important', 'standard']).nullable().optional(),
  country: z.string().max(100).optional(),
  serviceType: z.enum(['cloud', 'software', 'data', 'network', 'other']).nullable().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  nextReviewDate: z.string().optional(),
  vendorStatus: z.enum(['active', 'under-review', 'exited']).optional(),
  certifications: z.array(
    z.object({
      type: z.enum(['ISO27001', 'SOC2', 'CSA-STAR', 'ISO22301']),
      validUntil: z.string().min(1, 'Expiry date required'),
    })
  ).optional(),
  vendorFunctions: z.array(
    z.enum([
      'payment_processing',
      'settlement_clearing',
      'core_banking',
      'risk_management',
      'regulatory_reporting',
      'fraud_detection',
      'data_storage',
      'network_infrastructure',
      'identity_access_management',
      'business_continuity',
    ])
  ).optional(),
});

export type SettingsFormData = z.infer<typeof workspaceSettingsSchema>;

export const ICT_FUNCTIONS: { value: string; label: string }[] = [
  { value: 'payment_processing', label: 'Payment Processing' },
  { value: 'settlement_clearing', label: 'Settlement & Clearing' },
  { value: 'core_banking', label: 'Core Banking' },
  { value: 'risk_management', label: 'Risk Management' },
  { value: 'regulatory_reporting', label: 'Regulatory Reporting' },
  { value: 'fraud_detection', label: 'Fraud Detection' },
  { value: 'data_storage', label: 'Data Storage' },
  { value: 'network_infrastructure', label: 'Network Infrastructure' },
  { value: 'identity_access_management', label: 'Identity & Access Mgmt' },
  { value: 'business_continuity', label: 'Business Continuity' },
];

export function toDateInputValue(val: string | null | undefined): string {
  if (!val) return '';
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}
