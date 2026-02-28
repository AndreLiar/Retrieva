'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Trash2, Plus, X, ClipboardList, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { questionnairesApi } from '@/lib/api/questionnaires';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { destructiveActionClasses } from '@/lib/styles/status-colors';

// ─── Schema ───────────────────────────────────────────────────────────────────

const workspaceSettingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  vendorTier: z.enum(['critical', 'important', 'standard']).nullable().optional(),
  country: z.string().max(100).optional(),
  serviceType: z.enum(['cloud', 'software', 'data', 'network', 'other']).nullable().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  nextReviewDate: z.string().optional(),
  vendorStatus: z.enum(['active', 'under-review', 'exited']).optional(),
  certifications: z.array(z.object({
    type: z.enum(['ISO27001', 'SOC2', 'CSA-STAR', 'ISO22301']),
    validUntil: z.string().min(1, 'Expiry date required'),
  })).optional(),
  vendorFunctions: z.array(z.enum([
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
  ])).optional(),
});

type SettingsFormData = z.infer<typeof workspaceSettingsSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateInputValue(val: string | null | undefined): string {
  if (!val) return '';
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

const ICT_FUNCTIONS: { value: string; label: string }[] = [
  { value: 'payment_processing',         label: 'Payment Processing' },
  { value: 'settlement_clearing',        label: 'Settlement & Clearing' },
  { value: 'core_banking',               label: 'Core Banking' },
  { value: 'risk_management',            label: 'Risk Management' },
  { value: 'regulatory_reporting',       label: 'Regulatory Reporting' },
  { value: 'fraud_detection',            label: 'Fraud Detection' },
  { value: 'data_storage',               label: 'Data Storage' },
  { value: 'network_infrastructure',     label: 'Network Infrastructure' },
  { value: 'identity_access_management', label: 'Identity & Access Mgmt' },
  { value: 'business_continuity',        label: 'Business Continuity' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface WorkspaceSettingsPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const { isWorkspaceOwner } = usePermissions();

  const workspace = workspaces.find((w) => w.id === id);

  // Fetch latest completed questionnaire for the score card (independent query)
  const { data: latestQuestionnaire, isLoading: isQLoading } = useQuery({
    queryKey: ['questionnaire-score-card', id],
    queryFn: async () => {
      const res = await questionnairesApi.list({
        workspaceId: id,
        status: 'complete',
        limit: 1,
        page: 1,
      });
      return res.data?.questionnaires?.[0] ?? null;
    },
    enabled: !!id,
  });

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(workspaceSettingsSchema),
    defaultValues: {
      name: '',
      description: '',
      vendorTier: null,
      country: '',
      serviceType: null,
      contractStart: '',
      contractEnd: '',
      nextReviewDate: '',
      vendorStatus: 'active',
      certifications: [],
      vendorFunctions: [],
    },
  });

  const { fields: certFields, append: appendCert, remove: removeCert } = useFieldArray({
    control: form.control,
    name: 'certifications',
  });

  // Update form when workspace loads
  useEffect(() => {
    if (workspace) {
      form.reset({
        name: workspace.name,
        description: workspace.description || '',
        vendorTier: workspace.vendorTier ?? null,
        country: workspace.country || '',
        serviceType: workspace.serviceType ?? null,
        contractStart: toDateInputValue(workspace.contractStart),
        contractEnd: toDateInputValue(workspace.contractEnd),
        nextReviewDate: toDateInputValue(workspace.nextReviewDate),
        vendorStatus: workspace.vendorStatus || 'active',
        certifications: workspace.certifications?.map(c => ({
          type: c.type,
          validUntil: toDateInputValue(c.validUntil),
        })) ?? [],
        vendorFunctions: (workspace.vendorFunctions ?? []) as SettingsFormData['vendorFunctions'],
      });
    }
  }, [workspace, form]);

  // Redirect if not owner
  useEffect(() => {
    if (workspace && !isWorkspaceOwner) {
      router.replace(`/workspaces/${id}`);
      toast.error('You do not have permission to access workspace settings');
    }
  }, [workspace, isWorkspaceOwner, router, id]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      await updateWorkspace(id, {
        name: data.name,
        description: data.description,
        vendorTier: data.vendorTier,
        country: data.country,
        serviceType: data.serviceType,
        contractStart: data.contractStart || null,
        contractEnd: data.contractEnd || null,
        nextReviewDate: data.nextReviewDate || null,
        vendorStatus: data.vendorStatus,
        certifications: data.certifications?.map(c => ({
          type: c.type,
          validUntil: c.validUntil,
        })),
        vendorFunctions: data.vendorFunctions,
      });
    },
    onSuccess: () => {
      toast.success('Workspace updated successfully');
    },
    onError: () => {
      toast.error('Failed to update workspace');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteWorkspace(id);
    },
    onSuccess: () => {
      toast.success('Workspace deleted');
      router.push('/workspaces');
    },
    onError: () => {
      toast.error('Failed to delete workspace');
    },
  });

  if (!workspace || !isWorkspaceOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link href={`/workspaces/${id}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Workspace
        </Button>
      </Link>

      <h1 className="text-2xl font-semibold mb-6">Workspace Settings</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
          className="space-y-6"
        >
          {/* ── General Settings ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Update your workspace name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What is this workspace for?" {...field} />
                    </FormControl>
                    <FormDescription>
                      A brief description of what this workspace is used for
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* ── Vendor Profile ────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Vendor Profile</CardTitle>
              <CardDescription>
                DORA Article 28 — vendor classification, contract tracking, and certification monitoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vendorTier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Tier</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                        value={field.value ?? 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">— Not set —</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="important">Important</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                        value={field.value ?? 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">— Not set —</SelectItem>
                          <SelectItem value="cloud">Cloud</SelectItem>
                          <SelectItem value="software">Software</SelectItem>
                          <SelectItem value="data">Data</SelectItem>
                          <SelectItem value="network">Network</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Germany" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vendorStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="under-review">Under Review</SelectItem>
                          <SelectItem value="exited">Exited</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="contractStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Start</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contractEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract End</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextReviewDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Review</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Certifications manager */}
              <div>
                <FormLabel className="block mb-2">Certifications</FormLabel>
                <div className="space-y-2">
                  {certFields.map((certField, index) => (
                    <div key={certField.id} className="flex items-start gap-2">
                      <FormField
                        control={form.control}
                        name={`certifications.${index}.type`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Cert type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="ISO27001">ISO 27001</SelectItem>
                                <SelectItem value="SOC2">SOC 2</SelectItem>
                                <SelectItem value="CSA-STAR">CSA-STAR</SelectItem>
                                <SelectItem value="ISO22301">ISO 22301</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`certifications.${index}.validUntil`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input type="date" placeholder="Valid until" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 mt-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCert(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => appendCert({ type: 'ISO27001', validUntil: '' })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Certification
                </Button>
              </div>

              {/* ICT Function Categories (DORA Art. 28(3)(a)) */}
              <div>
                <FormLabel className="block mb-1">ICT Function Categories</FormLabel>
                <p className="text-xs text-muted-foreground mb-3">
                  DORA Art. 28(3)(a) — Select all ICT capabilities this vendor supports for your entity.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ICT_FUNCTIONS.map(({ value, label }) => {
                    const selected = (form.watch('vendorFunctions') as string[] ?? []).includes(value);
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const current = (form.getValues('vendorFunctions') as string[]) ?? [];
                          form.setValue(
                            'vendorFunctions',
                            (selected
                              ? current.filter((v) => v !== value)
                              : [...current, value]) as SettingsFormData['vendorFunctions'],
                            { shouldDirty: true }
                          );
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>

      {/* ── Questionnaire Score Card ──────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Questionnaire Score
          </CardTitle>
          <CardDescription>Latest DORA Art.28/30 due diligence result</CardDescription>
        </CardHeader>
        <CardContent>
          {isQLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : latestQuestionnaire ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span
                  className={`text-4xl font-bold ${
                    (latestQuestionnaire.overallScore ?? 0) >= 70
                      ? 'text-green-600'
                      : (latestQuestionnaire.overallScore ?? 0) >= 40
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {latestQuestionnaire.overallScore ?? '—'}
                </span>
                <div>
                  <span className="text-muted-foreground">/100</span>
                  <div className="mt-1">
                    <Badge
                      variant={
                        (latestQuestionnaire.overallScore ?? 0) >= 70
                          ? 'default'
                          : (latestQuestionnaire.overallScore ?? 0) >= 40
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {(latestQuestionnaire.overallScore ?? 0) >= 70
                        ? 'Low Risk'
                        : (latestQuestionnaire.overallScore ?? 0) >= 40
                          ? 'Medium Risk'
                          : 'High Risk'}
                    </Badge>
                  </div>
                </div>
                {latestQuestionnaire.respondedAt && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Submitted{' '}
                    {format(new Date(latestQuestionnaire.respondedAt), 'dd MMM yyyy')}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/questionnaires/${latestQuestionnaire._id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    View Full Results
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/questionnaires/new">
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    Send New Questionnaire
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                No completed questionnaire yet. Send a DORA due diligence questionnaire to this
                vendor to start tracking their compliance score.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/questionnaires/new">
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  Send Questionnaire
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Danger Zone ───────────────────────────────────────────────────── */}
      <Card className="border-destructive/50 mt-6">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible and destructive actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Workspace</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this workspace and all its data
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the workspace
                    &quot;{workspace.name}&quot; and all associated data including conversations,
                    documents, and member access.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className={destructiveActionClasses}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Delete Workspace'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
