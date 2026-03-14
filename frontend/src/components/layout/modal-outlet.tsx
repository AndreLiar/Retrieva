'use client';

import { useState } from 'react';
import {
  Building2, Loader2, ChevronRight, ChevronLeft,
  Cloud, Monitor, BarChart2, Network, Settings2, Building,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import { workspacesApi } from '@/lib/api/workspaces';
import type { VendorTier, VendorServiceType, VendorFunction } from '@/types';

// ─── Auto-tier logic ──────────────────────────────────────────────────────────

const CRITICAL_FUNCTIONS: VendorFunction[] = [
  'payment_processing', 'settlement_clearing', 'core_banking',
];
const IMPORTANT_FUNCTIONS: VendorFunction[] = [
  'risk_management', 'regulatory_reporting', 'fraud_detection',
  'identity_access_management', 'network_infrastructure',
];

function inferTier(fns: VendorFunction[]): VendorTier | null {
  if (fns.some(f => CRITICAL_FUNCTIONS.includes(f))) return 'critical';
  if (fns.some(f => IMPORTANT_FUNCTIONS.includes(f))) return 'important';
  if (fns.length > 0) return 'important'; // data_storage, business_continuity
  return null;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {([1, 2, 3, 4] as const).map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full transition-all ${
            n === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{step} of 4</span>
    </div>
  );
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

const TIER_COLORS: Record<VendorTier, string> = {
  critical:  'bg-red-100 text-red-700 border-red-200',
  important: 'bg-amber-100 text-amber-700 border-amber-200',
  standard:  'bg-blue-100 text-blue-700 border-blue-200',
};

function TierBadge({ tier }: { tier: VendorTier }) {
  const labels: Record<VendorTier, string> = {
    critical: 'Critical', important: 'Important', standard: 'Standard',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TIER_COLORS[tier]}`}>
      {labels[tier]}
    </span>
  );
}

// ─── Service type cards (Step 2) ──────────────────────────────────────────────

const ICT_CARDS = [
  { icon: Cloud,     label: 'Cloud / IaaS / SaaS',      value: 'cloud'    as VendorServiceType },
  { icon: Monitor,   label: 'Software / On-Premise',     value: 'software' as VendorServiceType },
  { icon: BarChart2, label: 'Data & Analytics',          value: 'data'     as VendorServiceType },
  { icon: Network,   label: 'Network & Connectivity',    value: 'network'  as VendorServiceType },
  { icon: Settings2, label: 'Other ICT Service',         value: 'other'    as VendorServiceType },
  { icon: Building,  label: 'Not an ICT service',        value: null },
] as const;

// ─── Function button groups (Step 3) ─────────────────────────────────────────

const FUNCTION_GROUPS = [
  {
    label: 'Critical ICT Functions',
    colorClass: 'bg-red-50 text-red-700 border-red-200',
    activeClass: 'bg-red-100 border-red-500 text-red-800',
    items: [
      { value: 'payment_processing'  as VendorFunction, label: 'Payment processing' },
      { value: 'settlement_clearing' as VendorFunction, label: 'Settlement & clearing' },
      { value: 'core_banking'        as VendorFunction, label: 'Core banking' },
    ],
  },
  {
    label: 'Important ICT Functions',
    colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
    activeClass: 'bg-amber-100 border-amber-500 text-amber-800',
    items: [
      { value: 'risk_management'            as VendorFunction, label: 'Risk management' },
      { value: 'regulatory_reporting'       as VendorFunction, label: 'Regulatory reporting' },
      { value: 'fraud_detection'            as VendorFunction, label: 'Fraud detection' },
      { value: 'identity_access_management' as VendorFunction, label: 'Identity & access mgmt' },
      { value: 'network_infrastructure'     as VendorFunction, label: 'Network infrastructure' },
    ],
  },
  {
    label: 'Supporting Functions',
    colorClass: 'bg-blue-50 text-blue-700 border-blue-200',
    activeClass: 'bg-blue-100 border-blue-500 text-blue-800',
    items: [
      { value: 'data_storage'        as VendorFunction, label: 'Data storage' },
      { value: 'business_continuity' as VendorFunction, label: 'Business continuity' },
    ],
  },
] as const;

const TIER_TOOLTIP: Record<VendorTier, string> = {
  critical:  'Strictest DORA controls — Art. 28(8) obligations and TLPT in scope.',
  important: 'Standard DORA due diligence and contractual requirements apply.',
  standard:  'Lighter-touch monitoring; DORA Art. 28 may still apply partially.',
};

const SERVICE_TYPE_LABEL: Record<VendorServiceType, string> = {
  cloud: 'Cloud (IaaS / PaaS / SaaS)', software: 'Software / On-Premise',
  data: 'Data & Analytics', network: 'Network & Connectivity', other: 'Other ICT',
};

const FUNCTION_LABEL: Record<VendorFunction, string> = {
  payment_processing: 'Payment processing', settlement_clearing: 'Settlement & clearing',
  core_banking: 'Core banking', risk_management: 'Risk management',
  regulatory_reporting: 'Regulatory reporting', fraud_detection: 'Fraud detection',
  data_storage: 'Data storage', network_infrastructure: 'Network infrastructure',
  identity_access_management: 'Identity & access mgmt', business_continuity: 'Business continuity',
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function CreateWorkspaceModal() {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal  = useUIStore((state) => state.closeModal);
  const queryClient = useQueryClient();

  const isOpen = activeModal === MODAL_IDS.CREATE_WORKSPACE;

  const [step, setStep]                     = useState<1 | 2 | 3 | 4>(1);
  const [name, setName]                     = useState('');
  const [serviceType, setServiceType]       = useState<VendorServiceType | null>(null);
  const [isIctService, setIsIctService]     = useState<boolean | null>(null);
  const [vendorFunctions, setVendorFunctions] = useState<VendorFunction[]>([]);
  const [tierOverride, setTierOverride]     = useState<VendorTier | ''>('');
  const [country, setCountry]               = useState('');
  const [contractStart, setContractStart]   = useState('');
  const [contractEnd, setContractEnd]       = useState('');
  const [nameError, setNameError]           = useState('');

  const suggestedTier = isIctService === false ? 'standard' : inferTier(vendorFunctions);
  const effectiveTier = (tierOverride || suggestedTier) as VendorTier | null;

  const reset = () => {
    setStep(1); setName(''); setServiceType(null); setIsIctService(null);
    setVendorFunctions([]); setTierOverride(''); setCountry('');
    setContractStart(''); setContractEnd(''); setNameError('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) { closeModal(); reset(); }
  };

  const mutation = useMutation({
    mutationFn: () =>
      workspacesApi.create({
        name,
        vendorTier:      effectiveTier || null,
        serviceType:     serviceType   || null,
        country:         country       || undefined,
        contractStart:   contractStart || null,
        contractEnd:     contractEnd   || null,
        vendorFunctions: vendorFunctions.length ? vendorFunctions : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Vendor workspace created');
      reset(); closeModal();
    },
    onError: () => toast.error('Failed to create workspace'),
  });

  const goToStep2 = () => {
    if (!name.trim()) { setNameError('Vendor name is required'); return; }
    if (name.trim().length < 2) { setNameError('Must be at least 2 characters'); return; }
    setNameError(''); setStep(2);
  };

  const handleServiceCardClick = (value: VendorServiceType | null) => {
    if (value === null) {
      setIsIctService(false); setServiceType(null);
    } else {
      setIsIctService(true); setServiceType(value);
    }
  };

  const goToStep3 = () => {
    if (isIctService === false) { setStep(4); } else { setStep(3); }
  };

  const toggleFunction = (fn: VendorFunction) => {
    setVendorFunctions(prev =>
      prev.includes(fn) ? prev.filter(f => f !== fn) : [...prev, fn]
    );
    if (tierOverride) setTierOverride('');
  };

  const stepTitles: Record<1 | 2 | 3 | 4, string> = {
    1: 'New Vendor Workspace',
    2: 'ICT Service Classification',
    3: 'Function & Tier Determination',
    4: 'Review & Contract Details',
  };
  const stepDescriptions: Record<1 | 2 | 3 | 4, string> = {
    1: 'Enter the vendor name to get started.',
    2: 'Is this an ICT service, and what type?',
    3: 'Which business functions does this vendor support? (DORA Art. 28)',
    4: 'Review the classification and add contract details.',
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <StepDots step={step} />
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>{stepDescriptions[step]}</DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Vendor name ── */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">
                Vendor name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ws-name"
                placeholder="e.g. Amazon Web Services"
                value={name}
                autoFocus
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') goToStep2(); }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
          </div>
        )}

        {/* ── Step 2: ICT service type cards ── */}
        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {ICT_CARDS.map(({ icon: Icon, label, value }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleServiceCardClick(value)}
                  className={`flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    (value !== null && serviceType === value) ||
                    (value === null && isIctService === false)
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium leading-snug">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
              Non-ICT suppliers fall outside DORA Art. 28 scope — lighter monitoring applies.
            </p>
          </div>
        )}

        {/* ── Step 3: Function selection + auto-tier ── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {FUNCTION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${group.colorClass}`}>
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map(({ value, label }) => {
                    const active = vendorFunctions.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleFunction(value)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active ? group.activeClass : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Vendor tier */}
            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">Vendor tier</span>
                {suggestedTier && tierOverride === '' && (
                  <span className="text-xs text-muted-foreground">(auto-suggested from functions)</span>
                )}
              </div>
              <Select
                value={tierOverride || suggestedTier || 'none'}
                onValueChange={(v) => setTierOverride(v === 'none' ? '' : v as VendorTier)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select vendor tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not set —</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                </SelectContent>
              </Select>
              {effectiveTier && (
                <p className="text-xs text-muted-foreground">{TIER_TOOLTIP[effectiveTier]}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              No specific functions — skip
            </button>
          </div>
        )}

        {/* ── Step 4: Review + contract details ── */}
        {step === 4 && (
          <div className="space-y-4 py-2">
            {/* Summary card */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{name}</span>
                {effectiveTier && <TierBadge tier={effectiveTier} />}
                {serviceType && (
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 bg-background">
                    {SERVICE_TYPE_LABEL[serviceType]}
                  </span>
                )}
                {isIctService === false && (
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 bg-background">
                    Non-ICT
                  </span>
                )}
              </div>
              {vendorFunctions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vendorFunctions.map(fn => (
                    <span key={fn} className="text-xs bg-background border rounded px-1.5 py-0.5 text-muted-foreground">
                      {FUNCTION_LABEL[fn]}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Contract fields */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-country">Vendor country</Label>
              <Input
                id="ws-country"
                placeholder="e.g. United States"
                value={country}
                autoFocus
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-start">Contract start</Label>
                <Input
                  id="ws-start"
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-end">Contract end</Label>
                <Input
                  id="ws-end"
                  type="date"
                  value={contractEnd}
                  onChange={(e) => setContractEnd(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
              Certifications, next review date, and exit strategy can be added in
              <strong> Workspace → Settings</strong> after creation.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={goToStep2}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={goToStep3} disabled={isIctService === null}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 4 && (
            <>
              <Button variant="outline" onClick={() => setStep(isIctService === false ? 2 : 3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={name.trim().length < 2 || mutation.isPending}
              >
                {mutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Building2 className="h-4 w-4 mr-2" />}
                Create workspace
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModalOutlet() {
  return (
    <>
      <CreateWorkspaceModal />
    </>
  );
}
