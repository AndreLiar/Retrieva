'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { fields, append, remove } = certificationsFieldArray;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href={`/workspaces/${workspaceId}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          {t('workspaces.members.back')}
        </Button>
      </Link>

      <h1 className="page-title mb-6">{t('workspaces.settingsForm.title')}</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('workspaces.settingsForm.general')}</CardTitle>
              <CardDescription>{t('workspaces.settingsForm.generalDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('workspaces.settingsForm.name')}</FormLabel>
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
                    <FormLabel>{t('workspaces.settingsForm.description')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('workspaces.settingsForm.descPlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('workspaces.settingsForm.descHelp')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('workspaces.settingsForm.vendorProfile')}</CardTitle>
              <CardDescription>
                {t('workspaces.settingsForm.vendorProfileDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vendorTier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('workspaces.settingsForm.vendorTier')}</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                        value={field.value ?? 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('workspaces.settingsForm.selectTier')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t('workspaces.wizard.tierNotSet')}</SelectItem>
                          <SelectItem value="critical">{t('workspaces.tier.critical')}</SelectItem>
                          <SelectItem value="important">{t('workspaces.tier.important')}</SelectItem>
                          <SelectItem value="standard">{t('workspaces.tier.standard')}</SelectItem>
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
                      <FormLabel>{t('workspaces.settingsForm.serviceType')}</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                        value={field.value ?? 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('workspaces.settingsForm.selectType')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t('workspaces.wizard.tierNotSet')}</SelectItem>
                          <SelectItem value="cloud">{t('workspaces.settingsForm.serviceCloud')}</SelectItem>
                          <SelectItem value="software">{t('workspaces.settingsForm.serviceSoftware')}</SelectItem>
                          <SelectItem value="data">{t('workspaces.settingsForm.serviceData')}</SelectItem>
                          <SelectItem value="network">{t('workspaces.settingsForm.serviceNetwork')}</SelectItem>
                          <SelectItem value="other">{t('workspaces.settingsForm.serviceOther')}</SelectItem>
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
                      <FormLabel>{t('workspaces.settingsForm.country')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('workspaces.settingsForm.countryPlaceholder')} {...field} />
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
                      <FormLabel>{t('workspaces.settingsForm.vendorStatus')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('workspaces.settingsForm.selectStatus')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('workspaces.status.active')}</SelectItem>
                          <SelectItem value="under-review">{t('workspaces.status.underReview')}</SelectItem>
                          <SelectItem value="exited">{t('workspaces.status.exited')}</SelectItem>
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
                      <FormLabel>{t('workspaces.settingsForm.contractStart')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('workspaces.settingsForm.contractDatesHelp')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contractEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('workspaces.settingsForm.contractEnd')}</FormLabel>
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
                      <FormLabel>{t('workspaces.settingsForm.nextReview')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <FormLabel className="block mb-2">{t('workspaces.settingsForm.certifications')}</FormLabel>
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
                                  <SelectValue placeholder={t('workspaces.settingsForm.certType')} />
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
                              <Input type="date" placeholder={t('workspaces.settingsForm.validUntil')} {...field} />
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
                  {t('workspaces.settingsForm.addCert')}
                </Button>
              </div>

              <div>
                <FormLabel className="block mb-1">{t('workspaces.settingsForm.ictFunctions')}</FormLabel>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('workspaces.settingsForm.ictFunctionsDesc')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ICT_FUNCTIONS.map(({ value }) => {
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
                        {t(`workspaces.wizard.functions.${value}`)}
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
              {t('settings.profile.save')}
            </Button>
          </div>
        </form>
      </Form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            {t('workspaces.settingsForm.qScore')}
          </CardTitle>
          <CardDescription>{t('workspaces.settingsForm.qScoreDesc')}</CardDescription>
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
                        ? t('workspaces.settingsForm.lowRisk')
                        : (latestQuestionnaire.overallScore ?? 0) >= 40
                          ? t('workspaces.settingsForm.mediumRisk')
                          : t('workspaces.settingsForm.highRisk')}
                    </Badge>
                  </div>
                </div>
                {latestQuestionnaire.respondedAt && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {t('workspaces.settingsForm.submitted', { date: format(new Date(latestQuestionnaire.respondedAt), 'dd MMM yyyy') })}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/questionnaires/${latestQuestionnaire._id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    {t('workspaces.settingsForm.viewFullResults')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/questionnaires/new">
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    {t('workspaces.settingsForm.sendNew')}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                {t('workspaces.settingsForm.noQ')}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/questionnaires/new">
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  {t('workspaces.settingsForm.sendQ')}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50 mt-6">
        <CardHeader>
          <CardTitle className="text-destructive">{t('workspaces.settingsForm.dangerZone')}</CardTitle>
          <CardDescription>{t('workspaces.settingsForm.dangerDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('workspaces.settingsForm.deleteWs')}</p>
              <p className="text-sm text-muted-foreground">
                {t('workspaces.settingsForm.deleteWsDesc')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('workspaces.settingsForm.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('workspaces.settingsForm.deleteConfirmDesc', { name: workspace.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className={destructiveActionClasses}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('workspaces.settingsForm.deleteWsAction')
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
