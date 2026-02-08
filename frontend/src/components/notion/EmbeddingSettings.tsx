'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Cloud,
  AlertTriangle,
  Check,
  Info,
  Loader2,
  FileSearch,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { embeddingsApi } from '@/lib/api';

interface EmbeddingSettingsProps {
  workspaceId: string;
}

const TRUST_LEVEL_CONFIG = {
  public: {
    label: 'Public',
    description: 'Non-sensitive data, standard processing',
    icon: ShieldCheck,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  internal: {
    label: 'Internal',
    description: 'Company data, requires data consent',
    icon: Shield,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  regulated: {
    label: 'Regulated',
    description: 'Sensitive/HIPAA/GDPR data, compliance review required',
    icon: ShieldAlert,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
};

const CLASSIFICATION_OPTIONS = {
  personal_notes: {
    label: 'Personal Notes',
    description: 'Personal notes, journals, non-sensitive content',
    icon: '📝',
  },
  team_docs: {
    label: 'Team Documents',
    description: 'Team collaboration docs, project notes',
    icon: '👥',
  },
  company_confidential: {
    label: 'Company Confidential',
    description: 'Business strategies, financials, HR docs',
    icon: '🏢',
  },
  regulated_data: {
    label: 'Regulated Data',
    description: 'Medical, legal, financial PII, government data',
    icon: '🔒',
  },
};

export function EmbeddingSettings({ workspaceId }: EmbeddingSettingsProps) {
  const queryClient = useQueryClient();
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  const [selectedClassification, setSelectedClassification] = useState<string>('');

  // Fetch embedding settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['embedding-settings', workspaceId],
    queryFn: async () => {
      const response = await embeddingsApi.getSettings(workspaceId);
      return response.data;
    },
    enabled: !!workspaceId,
  });

  // Fetch PII status
  const { data: piiStatus, isLoading: isLoadingPii } = useQuery({
    queryKey: ['pii-status', workspaceId],
    queryFn: async () => {
      const response = await embeddingsApi.getPiiStatus(workspaceId);
      return response.data;
    },
    enabled: !!workspaceId,
  });

  // Fetch disclosure for consent dialog
  const { data: disclosure } = useQuery({
    queryKey: ['embedding-disclosure'],
    queryFn: async () => {
      const response = await embeddingsApi.getDisclosure();
      return response.data;
    },
    enabled: consentDialogOpen,
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Parameters<typeof embeddingsApi.updateSettings>[1]) => {
      return embeddingsApi.updateSettings(workspaceId, newSettings);
    },
    onSuccess: () => {
      toast.success('Settings updated');
      queryClient.invalidateQueries({ queryKey: ['embedding-settings', workspaceId] });
    },
    onError: () => {
      toast.error('Failed to update settings');
    },
  });

  // Grant consent mutation
  const grantConsentMutation = useMutation({
    mutationFn: async () => {
      return embeddingsApi.grantConsent(workspaceId);
    },
    onSuccess: () => {
      toast.success('Cloud embedding consent granted');
      setConsentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['embedding-settings', workspaceId] });
    },
    onError: () => {
      toast.error('Failed to grant consent');
    },
  });

  // Revoke consent mutation
  const revokeConsentMutation = useMutation({
    mutationFn: async () => {
      return embeddingsApi.revokeConsent(workspaceId);
    },
    onSuccess: () => {
      toast.success('Cloud embedding consent revoked');
      queryClient.invalidateQueries({ queryKey: ['embedding-settings', workspaceId] });
    },
    onError: () => {
      toast.error('Failed to revoke consent');
    },
  });

  // Declare classification mutation
  const declareClassificationMutation = useMutation({
    mutationFn: async (classificationType: string) => {
      return embeddingsApi.declareClassification(workspaceId, classificationType);
    },
    onSuccess: (response) => {
      toast.success('Data classification saved');
      setClassificationDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['embedding-settings', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['pii-status', workspaceId] });
      if (response.data?.note) {
        toast.info(response.data.note);
      }
    },
    onError: () => {
      toast.error('Failed to save classification');
    },
  });

  if (isLoadingSettings) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const trustConfig = TRUST_LEVEL_CONFIG[settings?.trustLevel || 'internal'];
  const TrustIcon = trustConfig.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Data Privacy & Embedding Settings
        </CardTitle>
        <CardDescription>
          Configure how your documents are processed and embedded
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trust Level Display */}
        <div className={`p-4 rounded-lg ${trustConfig.bgColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrustIcon className={`h-6 w-6 ${trustConfig.color}`} />
              <div>
                <p className={`font-medium ${trustConfig.color}`}>
                  Trust Level: {trustConfig.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  {trustConfig.description}
                </p>
              </div>
            </div>
            <Badge variant={settings?.trustLevel === 'regulated' ? 'destructive' : 'secondary'}>
              {settings?.trustLevel?.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* PII Detection Alert */}
        {piiStatus?.autoUpgraded && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Sensitive Data Detected</AlertTitle>
            <AlertDescription>
              The system automatically upgraded your trust level from {piiStatus.autoUpgradedFrom} to {piiStatus.currentTrustLevel} after detecting sensitive patterns: {piiStatus.detectedPatterns?.slice(0, 3).join(', ')}.
              {piiStatus.currentTrustLevel === 'regulated' && ' Additional compliance review may be required.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Data Classification */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Data Classification</Label>
              <p className="text-sm text-muted-foreground">
                Declare what type of data this workspace contains
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClassificationDialogOpen(true)}
            >
              {piiStatus?.dataClassification?.declaredType === 'not_set' ? 'Set Classification' : 'Change'}
            </Button>
          </div>
          {piiStatus?.dataClassification?.declaredType && piiStatus.dataClassification.declaredType !== 'not_set' && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-xl">
                {CLASSIFICATION_OPTIONS[piiStatus.dataClassification.declaredType as keyof typeof CLASSIFICATION_OPTIONS]?.icon || '📄'}
              </span>
              <div>
                <p className="font-medium">
                  {CLASSIFICATION_OPTIONS[piiStatus.dataClassification.declaredType as keyof typeof CLASSIFICATION_OPTIONS]?.label || piiStatus.dataClassification.declaredType}
                </p>
                <p className="text-xs text-muted-foreground">
                  Declared on {new Date(piiStatus.dataClassification.declaredAt!).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Cloud Embedding Provider (Azure OpenAI) */}
        <div className="space-y-3">
          <Label className="text-base">Embedding Provider</Label>
          <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <Cloud className="h-5 w-5 text-primary" />
              <span className="font-medium">Azure OpenAI</span>
              <Badge variant="secondary" className="ml-auto">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Enterprise-grade cloud processing with Microsoft Azure security and compliance.
            </p>
          </div>
        </div>

        {/* Cloud Consent Status */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Data Processing Consent: {settings?.embeddingSettings?.cloudConsent ? 'Granted' : 'Not granted'}
              </span>
            </div>
            {settings?.embeddingSettings?.cloudConsent ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revokeConsentMutation.mutate()}
                disabled={revokeConsentMutation.isPending}
              >
                {revokeConsentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Revoke'
                )}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConsentDialogOpen(true)}
              >
                Grant Consent
              </Button>
            )}
          </div>
          {settings?.trustLevel === 'regulated' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Regulated Data Notice</AlertTitle>
              <AlertDescription>
                This workspace contains regulated data. Additional compliance review may be required.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* PII Scan Info */}
        {!isLoadingPii && piiStatus?.lastScan && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <FileSearch className="h-3 w-3" />
            <span>
              Last PII scan: {new Date(piiStatus.lastScan).toLocaleString()}
              {piiStatus.piiDetected && ` • ${piiStatus.detectedPatterns?.length || 0} patterns detected`}
            </span>
          </div>
        )}
      </CardContent>

      {/* Consent Dialog */}
      <Dialog open={consentDialogOpen} onOpenChange={setConsentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{disclosure?.title || 'Cloud Embedding Consent'}</DialogTitle>
            <DialogDescription>
              {disclosure?.description || 'Review the information below before enabling cloud embeddings.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {disclosure?.dataProcessed && (
              <div>
                <p className="font-medium text-sm mb-2">Data Processed:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {disclosure.dataProcessed.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {disclosure?.benefits && (
              <div>
                <p className="font-medium text-sm mb-2">Benefits:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {disclosure.benefits.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-blue-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Provider: {disclosure?.provider} ({disclosure?.model})
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => grantConsentMutation.mutate()}
              disabled={grantConsentMutation.isPending}
            >
              {grantConsentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              I Agree & Grant Consent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classification Dialog */}
      <Dialog open={classificationDialogOpen} onOpenChange={setClassificationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classify Your Data</DialogTitle>
            <DialogDescription>
              Select the type that best describes your workspace content. This helps determine the appropriate security level.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {Object.entries(CLASSIFICATION_OPTIONS).map(([key, option]) => (
              <div
                key={key}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedClassification === key
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
                onClick={() => setSelectedClassification(key)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div>
                    <p className="font-medium">{option.label}</p>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                  {selectedClassification === key && (
                    <Check className="h-5 w-5 text-primary ml-auto" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassificationDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => declareClassificationMutation.mutate(selectedClassification)}
              disabled={!selectedClassification || declareClassificationMutation.isPending}
            >
              {declareClassificationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Classification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default EmbeddingSettings;
