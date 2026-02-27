'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { getErrorMessage } from '@/lib/api';

const schema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(120),
  vendorName: z.string().min(2, 'Vendor name must be at least 2 characters').max(100),
});

type FormValues = z.infer<typeof schema>;

interface FileWithId extends File {
  id: string;
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [framework, setFramework] = useState<'DORA' | 'CONTRACT_A30'>('DORA');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', vendorName: '' },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (files.length === 0) throw new Error('Please upload at least one document.');
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
      toast.success('Assessment created — indexing documents…');
      router.push(id ? `/assessments/${id}` : '/assessments');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace first</p>
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
        Assessments
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">
          {framework === 'CONTRACT_A30' ? 'New Contract Review (Art. 30)' : 'New DORA Assessment'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {framework === 'CONTRACT_A30'
            ? 'Upload the ICT contract to check all 12 mandatory DORA Article 30 clauses.'
            : 'Upload vendor ICT documentation to run a gap analysis against Regulation (EU) 2022/2554.'}
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
            <p className="text-sm font-medium leading-none">Assessment type</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={framework === 'DORA' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFramework('DORA')}
              >
                Gap Analysis (Art. 28/29)
              </Button>
              <Button
                type="button"
                variant={framework === 'CONTRACT_A30' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFramework('CONTRACT_A30')}
              >
                Contract Review (Art. 30)
              </Button>
            </div>
          </div>

          <FormField
            control={form.control}
            name="vendorName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Acme Cloud Services" {...field} />
                </FormControl>
                <FormDescription>
                  The third-party ICT service provider being assessed.
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
                <FormLabel>Assessment name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Annual DORA review 2025" {...field} />
                </FormControl>
                <FormDescription>
                  A short label to identify this assessment in the dashboard.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* File upload */}
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">
              {framework === 'CONTRACT_A30' ? 'Contract document' : 'Vendor documents'}
            </p>
            <FileUploadZone files={files} onChange={setFiles} />
            {files.length === 0 && createMutation.isError && (
              <p className="text-xs text-destructive">
                Please upload at least one document.
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || files.length === 0}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                'Start Assessment'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
