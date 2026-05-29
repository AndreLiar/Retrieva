'use client';

import { useState } from 'react';
import {
  BarChart2,
  Building,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Loader2,
  Monitor,
  Network,
  Settings2,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { workspacesApi } from '@/features/workspaces/api/workspaces';
import { MODAL_IDS, useUIStore } from '@/state/ui-store';
import type { VendorFunction, VendorServiceType, VendorTier } from '@/types';

const CRITICAL_FUNCTIONS: VendorFunction[] = [
  'payment_processing',
  'settlement_clearing',
  'core_banking',
];
const IMPORTANT_FUNCTIONS: VendorFunction[] = [
  'risk_management',
  'regulatory_reporting',
  'fraud_detection',
  'identity_access_management',
  'network_infrastructure',
];

const ICT_CARDS = [
  { icon: Cloud, labelKey: 'workspaces.wizard.ictCards.cloud', value: 'cloud' as VendorServiceType },
  { icon: Monitor, labelKey: 'workspaces.wizard.ictCards.software', value: 'software' as VendorServiceType },
  { icon: BarChart2, labelKey: 'workspaces.wizard.ictCards.data', value: 'data' as VendorServiceType },
  { icon: Network, labelKey: 'workspaces.wizard.ictCards.network', value: 'network' as VendorServiceType },
  { icon: Settings2, labelKey: 'workspaces.wizard.ictCards.other', value: 'other' as VendorServiceType },
  { icon: Building, labelKey: 'workspaces.wizard.ictCards.notIct', value: null },
] as const;

const FUNCTION_GROUPS = [
  {
    labelKey: 'workspaces.wizard.groupCritical',
    colorClass: 'bg-destructive/10 text-destructive border-destructive/20',
    activeClass: 'bg-destructive/15 border-destructive text-destructive',
    items: ['payment_processing', 'settlement_clearing', 'core_banking'] as VendorFunction[],
  },
  {
    labelKey: 'workspaces.wizard.groupImportant',
    colorClass: 'bg-warning-muted text-warning border-warning-muted',
    activeClass: 'bg-warning-muted border-warning text-warning',
    items: [
      'risk_management',
      'regulatory_reporting',
      'fraud_detection',
      'identity_access_management',
      'network_infrastructure',
    ] as VendorFunction[],
  },
  {
    labelKey: 'workspaces.wizard.groupSupporting',
    colorClass: 'bg-info-muted text-info border-info-muted',
    activeClass: 'bg-info-muted border-info text-info',
    items: ['data_storage', 'business_continuity'] as VendorFunction[],
  },
] as const;

const TIER_COLORS: Record<VendorTier, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  important: 'bg-warning-muted text-warning border-warning-muted',
  standard: 'bg-info-muted text-info border-info-muted',
};

function inferTier(functions: VendorFunction[]): VendorTier | null {
  if (functions.some((value) => CRITICAL_FUNCTIONS.includes(value))) return 'critical';
  if (functions.some((value) => IMPORTANT_FUNCTIONS.includes(value))) return 'important';
  if (functions.length > 0) return 'important';
  return null;
}

function StepDots({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {([1, 2, 3, 4] as const).map((value) => (
        <span
          key={value}
          className={`h-1.5 rounded-full transition-all ${
            value === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{t('workspaces.wizard.stepsOf', { step })}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: VendorTier }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TIER_COLORS[tier]}`}
    >
      {t(`workspaces.tier.${tier}`)}
    </span>
  );
}

export function CreateWorkspaceWizard() {
  const { t } = useTranslation();
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const queryClient = useQueryClient();
  const isOpen = activeModal === MODAL_IDS.CREATE_WORKSPACE;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState<VendorServiceType | null>(null);
  const [isIctService, setIsIctService] = useState<boolean | null>(null);
  const [vendorFunctions, setVendorFunctions] = useState<VendorFunction[]>([]);
  const [tierOverride, setTierOverride] = useState<VendorTier | ''>('');
  const [country, setCountry] = useState('');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [nameError, setNameError] = useState('');

  const suggestedTier = isIctService === false ? 'standard' : inferTier(vendorFunctions);
  const effectiveTier = (tierOverride || suggestedTier) as VendorTier | null;

  const reset = () => {
    setStep(1);
    setName('');
    setServiceType(null);
    setIsIctService(null);
    setVendorFunctions([]);
    setTierOverride('');
    setCountry('');
    setContractStart('');
    setContractEnd('');
    setNameError('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
      reset();
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      workspacesApi.create({
        name,
        vendorTier: effectiveTier || null,
        serviceType: serviceType || null,
        country: country || undefined,
        contractStart: contractStart || null,
        contractEnd: contractEnd || null,
        vendorFunctions: vendorFunctions.length ? vendorFunctions : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success(t('workspaces.wizard.toastCreated'));
      reset();
      closeModal();
    },
    onError: () => {
      toast.error(t('workspaces.wizard.toastFailed'));
    },
  });

  const goToStep2 = () => {
    if (!name.trim()) {
      setNameError(t('workspaces.wizard.nameRequired'));
      return;
    }
    if (name.trim().length < 2) {
      setNameError(t('workspaces.wizard.nameMin'));
      return;
    }
    setNameError('');
    setStep(2);
  };

  const toggleFunction = (value: VendorFunction) => {
    setVendorFunctions((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
    if (tierOverride) {
      setTierOverride('');
    }
  };

  const stepTitles: Record<1 | 2 | 3 | 4, string> = {
    1: t('workspaces.wizard.titleS1'),
    2: t('workspaces.wizard.titleS2'),
    3: t('workspaces.wizard.titleS3'),
    4: t('workspaces.wizard.titleS4'),
  };

  const stepDescriptions: Record<1 | 2 | 3 | 4, string> = {
    1: t('workspaces.wizard.descS1'),
    2: t('workspaces.wizard.descS2'),
    3: t('workspaces.wizard.descS3'),
    4: t('workspaces.wizard.descS4'),
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <StepDots step={step} />
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>{stepDescriptions[step]}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">
                {t('workspaces.wizard.vendorName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ws-name"
                placeholder={t('workspaces.wizard.vendorNamePlaceholder')}
                value={name}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') goToStep2();
                }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {ICT_CARDS.map(({ icon: Icon, labelKey, value }) => (
                <button
                  key={labelKey}
                  type="button"
                  onClick={() => {
                    if (value === null) {
                      setIsIctService(false);
                      setServiceType(null);
                    } else {
                      setIsIctService(true);
                      setServiceType(value);
                    }
                  }}
                  className={`flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    (value !== null && serviceType === value) || (value === null && isIctService === false)
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium leading-snug">{t(labelKey)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
              {t('workspaces.wizard.nonIctNote')}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            {FUNCTION_GROUPS.map((group) => (
              <div key={group.labelKey} className="space-y-1.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${group.colorClass}`}
                >
                  {t(group.labelKey)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((value) => {
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
                        {t(`workspaces.wizard.functions.${value}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{t('workspaces.wizard.vendorTier')}</span>
                {suggestedTier && tierOverride === '' && (
                  <span className="text-xs text-muted-foreground">{t('workspaces.wizard.autoSuggested')}</span>
                )}
              </div>
              <Select
                value={tierOverride || suggestedTier || 'none'}
                onValueChange={(value) => setTierOverride(value === 'none' ? '' : (value as VendorTier))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('workspaces.wizard.selectTier')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('workspaces.wizard.tierNotSet')}</SelectItem>
                  <SelectItem value="critical">{t('workspaces.tier.critical')}</SelectItem>
                  <SelectItem value="important">{t('workspaces.tier.important')}</SelectItem>
                  <SelectItem value="standard">{t('workspaces.tier.standard')}</SelectItem>
                </SelectContent>
              </Select>
              {effectiveTier && <p className="text-xs text-muted-foreground">{t(`workspaces.wizard.tierTooltip.${effectiveTier}`)}</p>}
            </div>

            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t('workspaces.wizard.skipFunctions')}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{name}</span>
                {effectiveTier && <TierBadge tier={effectiveTier} />}
                {serviceType && (
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 bg-background">
                    {t(`workspaces.wizard.serviceTypeLabel.${serviceType}`)}
                  </span>
                )}
                {isIctService === false && (
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 bg-background">
                    {t('workspaces.wizard.nonIct')}
                  </span>
                )}
              </div>
              {vendorFunctions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vendorFunctions.map((value) => (
                    <span
                      key={value}
                      className="text-xs bg-background border rounded px-1.5 py-0.5 text-muted-foreground"
                    >
                      {t(`workspaces.wizard.functions.${value}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-country">{t('workspaces.wizard.country')}</Label>
              <Input
                id="ws-country"
                placeholder={t('workspaces.wizard.countryPlaceholder')}
                value={country}
                autoFocus
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-start">{t('workspaces.wizard.contractStart')}</Label>
                <Input
                  id="ws-start"
                  type="date"
                  value={contractStart}
                  onChange={(event) => setContractStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-end">{t('workspaces.wizard.contractEnd')}</Label>
                <Input
                  id="ws-end"
                  type="date"
                  value={contractEnd}
                  onChange={(event) => setContractEnd(event.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
              {t('workspaces.wizard.settingsNote1')}
              <strong>{t('workspaces.wizard.settingsNoteStrong')}</strong>{t('workspaces.wizard.settingsNote2')}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={goToStep2}>
                {t('workspaces.wizard.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('workspaces.wizard.back')}
              </Button>
              <Button onClick={() => setStep(isIctService === false ? 4 : 3)} disabled={isIctService === null}>
                {t('workspaces.wizard.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('workspaces.wizard.back')}
              </Button>
              <Button onClick={() => setStep(4)}>
                {t('workspaces.wizard.next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 4 && (
            <>
              <Button variant="outline" onClick={() => setStep(isIctService === false ? 2 : 3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('workspaces.wizard.back')}
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={name.trim().length < 2 || mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4 mr-2" />
                )}
                {t('workspaces.wizard.create')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
