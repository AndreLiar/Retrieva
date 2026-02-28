'use client';

import { useState } from 'react';
import { Building2, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
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
import type { VendorTier, VendorServiceType } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIER_LABELS: Record<VendorTier, string> = {
  critical:  'Critical — core banking, payments, settlement',
  important: 'Important — reporting, operations, risk systems',
  standard:  'Standard — productivity, collaboration tools',
};

const SERVICE_TYPE_LABELS = {
  cloud:    'Cloud (IaaS / PaaS / SaaS)',
  software: 'Software / On-premise',
  data:     'Data & Analytics',
  network:  'Network & Connectivity',
  other:    'Other',
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {[1, 2].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full transition-all ${
            n === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{step} of 2</span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function CreateWorkspaceModal() {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal  = useUIStore((state) => state.closeModal);
  const queryClient = useQueryClient();

  const isOpen = activeModal === MODAL_IDS.CREATE_WORKSPACE;

  // form state
  const [step, setStep]                       = useState<1 | 2>(1);
  const [name, setName]                       = useState('');
  const [vendorTier, setVendorTier]           = useState<VendorTier | ''>('');
  const [serviceType, setServiceType]         = useState<VendorServiceType | ''>('');
  const [country, setCountry]                 = useState('');
  const [contractStart, setContractStart]     = useState('');
  const [contractEnd, setContractEnd]         = useState('');
  const [nameError, setNameError]             = useState('');

  const reset = () => {
    setStep(1);
    setName('');
    setVendorTier('');
    setServiceType('');
    setCountry('');
    setContractStart('');
    setContractEnd('');
    setNameError('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) { closeModal(); reset(); }
  };

  const mutation = useMutation({
    mutationFn: () =>
      workspacesApi.create({
        name,
        vendorTier:    vendorTier    || null,
        serviceType:   serviceType   || null,
        country:       country       || undefined,
        contractStart: contractStart || null,
        contractEnd:   contractEnd   || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Vendor workspace created');
      reset();
      closeModal();
    },
    onError: () => toast.error('Failed to create workspace'),
  });

  // Step 1 → 2 validation
  const goToStep2 = () => {
    if (!name.trim()) { setNameError('Vendor name is required'); return; }
    if (name.trim().length < 2) { setNameError('Must be at least 2 characters'); return; }
    setNameError('');
    setStep(2);
  };

  const canCreate = name.trim().length >= 2;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <StepDots step={step} />
          <DialogTitle>
            {step === 1 ? 'New Vendor Workspace' : 'Contract Details'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Name the vendor and classify it for DORA Article 28 scoping.'
              : 'Optional — add contract dates now or in Settings later.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            {/* Vendor name */}
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
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
            </div>

            {/* Service type */}
            <div className="space-y-1.5">
              <Label>Service type</Label>
              <Select
                value={serviceType || 'none'}
                onValueChange={(v) => setServiceType(v === 'none' ? '' : v as VendorServiceType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not set —</SelectItem>
                  {Object.entries(SERVICE_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendor tier */}
            <div className="space-y-1.5">
              <Label>
                Vendor tier{' '}
                <span className="text-xs text-muted-foreground font-normal">(DORA Art. 28)</span>
              </Label>
              <Select
                value={vendorTier || 'none'}
                onValueChange={(v) => setVendorTier(v === 'none' ? '' : v as VendorTier)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not set —</SelectItem>
                  {(Object.entries(TIER_LABELS) as [VendorTier, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vendorTier && (
                <p className="text-xs text-muted-foreground">
                  {vendorTier === 'critical'
                    ? 'Stricter DORA controls apply — Art. 28(8) and TLPT in scope.'
                    : vendorTier === 'important'
                      ? 'Standard DORA due diligence required.'
                      : 'Lighter-touch monitoring; DORA Art. 28 may still apply.'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Country */}
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

            {/* Contract dates */}
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
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={goToStep2}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!canCreate || mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4 mr-2" />
                )}
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
