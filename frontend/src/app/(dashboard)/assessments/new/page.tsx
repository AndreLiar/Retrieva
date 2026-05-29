'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { FileUploadZone } from '@/components/assessment/FileUploadZone';
import { assessmentsApi } from '@/lib/api/assessments';
import { useActiveWorkspace } from '@/lib/hooks';
import { getErrorMessage } from '@/lib/api';

const schema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(120),
  vendorName: z.string().min(2, 'Vendor name must be at least 2 characters').max(100),
});

type FormValues = z.infer<typeof schema>;

interface FileWithId extends File {
  id: string;
}

function buildAssessmentName(
  vendor: string,
  typeLabel: string,
  locale: string,
  vendorFallback: string,
): string {
  const now = new Date();
  const month = now.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
  const year = now.getFullYear();
  return `${vendor.trim() || vendorFallback} — ${typeLabel} ${month} ${year}`;
}

export default function NewAssessmentPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [framework, setFramework] = useState<'DORA' | 'CONTRACT_A30'>('DORA');
  const [nameIsAuto, setNameIsAuto] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', vendorName: '' },
  });

  const vendorName = form.watch('vendorName');

  const computeName = () =>
    buildAssessmentName(
      vendorName,
      framework === 'CONTRACT_A30'
        ? t('assessments.form.nameTypeA30')
        : t('assessments.form.nameTypeDora'),
      i18n.language,
      t('assessments.form.vendorFallback'),
    );

  // Seed vendorName (and auto name) once the workspace is available
  useEffect(() => {
    if (!activeWorkspace?.name) return;
    form.setValue('vendorName', activeWorkspace.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.name]);

  // Auto-regenerate assessment name whenever vendor or framework changes
  useEffect(() => {
    if (!nameIsAuto) return;
    form.setValue('name', computeName());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorName, framework, nameIsAuto, i18n.language]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (files.length === 0) throw new Error(t('assessments.form.uploadAtLeastOne'));
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('vendorName', values.vendorName);
      formData.append('framework', framework);
      if (activeWorkspace?.id) formData.append('workspaceId', activeWorkspace.id);
      files.forEach((file) => formData.append('files', file));
      return assessmentsApi.create(formData);
    },
    onSuccess: (res) => {
      const id = res.data?.assessment?._id;
      toast.success(t('assessments.form.toastCreated'));
      router.push(id ? `/assessments/${id}` : '/assessments');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('assessments.form.selectWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push('/assessments')}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t('assessments.form.back')}
      </Button>

      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {framework === 'CONTRACT_A30'
            ? t('assessments.form.titleA30')
            : t('assessments.form.titleDora')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {framework === 'CONTRACT_A30'
            ? t('assessments.form.subtitleA30')
            : t('assessments.form.subtitleDora')}
        </p>
      </div>

      {/* Form */}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
          className="space-y-6"
        >
          {/* Framework toggle */}
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">{t('assessments.form.type')}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={framework === 'DORA' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFramework('DORA')}
              >
                {t('assessments.form.typeDora')}
              </Button>
              <Button
                type="button"
                variant={framework === 'CONTRACT_A30' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFramework('CONTRACT_A30')}
              >
                {t('assessments.form.typeA30')}
              </Button>
            </div>
          </div>

          <FormField
            control={form.control}
            name="vendorName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('assessments.form.vendorName')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('assessments.form.vendorNamePlaceholder')} {...field} />
                </FormControl>
                <FormDescription>
                  {t('assessments.form.vendorNameDesc')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t('assessments.form.name')}</FormLabel>
                  {!nameIsAuto && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        setNameIsAuto(true);
                        form.setValue('name', computeName());
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('assessments.form.resetAuto')}
                    </button>
                  )}
                </div>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setNameIsAuto(e.target.value === '');
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {nameIsAuto
                    ? t('assessments.form.nameDescAuto')
                    : t('assessments.form.nameDescCustom')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* File upload */}
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">
              {framework === 'CONTRACT_A30'
                ? t('assessments.form.docsA30')
                : t('assessments.form.docsDora')}
            </p>
            <FileUploadZone files={files} onChange={setFiles} />
            {files.length === 0 && createMutation.isError && (
              <p className="text-xs text-destructive">
                {t('assessments.form.uploadAtLeastOne')}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/assessments')}
              disabled={createMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || files.length === 0}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('assessments.form.uploading')}
                </>
              ) : (
                t('assessments.form.start')
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
