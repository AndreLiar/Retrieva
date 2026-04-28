'use client';

import Link from 'next/link';
import { ClipboardList, ExternalLink, Loader2, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import type { UseMutationResult } from '@tanstack/react-query';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
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
} from '@/shared/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { Textarea } from '@/shared/ui/textarea';
import { destructiveActionClasses } from '@/shared/styles/status-colors';
import type { VendorQuestionnaire } from '@/features/questionnaires/api/questionnaires';
import type { WorkspaceWithMembership } from '@/types';
import {
  ICT_FUNCTIONS,
  SettingsFormData,
} from '@/features/workspaces/settings/workspace-settings-schema';

interface WorkspaceSettingsFormProps {
  workspace: WorkspaceWithMembership;
  workspaceId: string;
  form: UseFormReturn<SettingsFormData>;
  vendorFunctions: SettingsFormData['vendorFunctions'];
  certificationsFieldArray: UseFieldArrayReturn<SettingsFormData, 'certifications'>;
  updateMutation: UseMutationResult<void, Error, SettingsFormData, unknown>;
  deleteMutation: UseMutationResult<void, Error, void, unknown>;
  latestQuestionnaire: VendorQuestionnaire | null | undefined;
  isQuestionnaireLoading: boolean;
}

export function WorkspaceSettingsForm({
  workspace,
  workspaceId,
  form,
  vendorFunctions,
  certificationsFieldArray,
  updateMutation,
  deleteMutation,
  latestQuestionnaire,
  isQuestionnaireLoading,
}: WorkspaceSettingsFormProps) {
  const { fields, append, remove } = certificationsFieldArray;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href={`/workspaces/${workspaceId}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          Back to Workspace
        </Button>
      </Link>

      <h1 className="page-title mb-6">Workspace Settings</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
          className="space-y-6"
        >
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
                        onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
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
                        onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
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

              <div>
                <FormLabel className="block mb-2">Certifications</FormLabel>
                <div className="space-y-2">
                  {fields.map((certField, index) => (
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
                        onClick={() => remove(index)}
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
                  onClick={() => append({ type: 'ISO27001', validUntil: '' })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Certification
                </Button>
              </div>

              <div>
                <FormLabel className="block mb-1">ICT Function Categories</FormLabel>
                <p className="text-xs text-muted-foreground mb-3">
                  DORA Art. 28(3)(a) — Select all ICT capabilities this vendor supports for your entity.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ICT_FUNCTIONS.map(({ value, label }) => {
                    const selected = (vendorFunctions as string[]).includes(value);
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
                              ? current.filter((item) => item !== value)
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

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Questionnaire Score
          </CardTitle>
          <CardDescription>Latest DORA Art.28/30 due diligence result</CardDescription>
        </CardHeader>
        <CardContent>
          {isQuestionnaireLoading ? (
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
                      ? 'text-success'
                      : (latestQuestionnaire.overallScore ?? 0) >= 40
                        ? 'text-warning'
                        : 'text-destructive'
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
                    Submitted {format(new Date(latestQuestionnaire.respondedAt), 'dd MMM yyyy')}
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
                No completed questionnaire yet. Send a DORA due diligence questionnaire to this vendor to start tracking their compliance score.
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
