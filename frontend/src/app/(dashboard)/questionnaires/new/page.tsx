'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Send, FileText } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { questionnairesApi } from '@/lib/api/questionnaires';
import { useActiveWorkspace } from '@/lib/hooks';
import { getErrorMessage } from '@/lib/api';

const schema = z.object({
  vendorName: z.string().min(2, 'Vendor name must be at least 2 characters').max(200),
  vendorContactName: z.string().max(200).optional(),
  vendorEmail: z.string().email('Please enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export default function NewQuestionnairePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();
  const [step, setStep] = useState<'form' | 'sending'>('form');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { vendorName: '', vendorContactName: '', vendorEmail: '' },
  });

  const createAndSendMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeWorkspace?.id) throw new Error('No active workspace selected');
      setStep('sending');

      // Step 1: Create questionnaire
      const createRes = await questionnairesApi.create({
        vendorName: values.vendorName,
        vendorEmail: values.vendorEmail,
        vendorContactName: values.vendorContactName || undefined,
        workspaceId: activeWorkspace.id,
      });

      const questionnaireId = createRes.data?.questionnaire?._id;
      if (!questionnaireId) throw new Error('Failed to create questionnaire');

      // Step 2: Send invitation email (non-blocking failure)
      try {
        await questionnairesApi.send(questionnaireId);
      } catch {
        toast.warning(t('questionnaires.new.toastEmailFailed'));
      }

      return questionnaireId;
    },
    onSuccess: (id) => {
      toast.success(t('questionnaires.new.toastSent'));
      router.push(`/questionnaires/${id}`);
    },
    onError: (err) => {
      setStep('form');
      toast.error(getErrorMessage(err));
    },
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('questionnaires.selectWorkspace')}</p>
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
        onClick={() => router.push('/questionnaires')}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t('questionnaires.title')}
      </Button>

      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t('questionnaires.new.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('questionnaires.new.subtitle')}</p>
      </div>

      {/* Template info card */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('questionnaires.new.template')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{t('questionnaires.new.templateName')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('questionnaires.new.templateDesc')}</p>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('questionnaires.new.vendorDetails')}</CardTitle>
          <CardDescription>{t('questionnaires.new.vendorDetailsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => createAndSendMutation.mutate(v))}
              className="space-y-5"
            >
              <FormField
                control={form.control}
                name="vendorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('questionnaires.new.companyName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('questionnaires.new.companyNamePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendorContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('questionnaires.new.contactName')}{' '}
                      <span className="text-muted-foreground font-normal">({t('common.optional')})</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('questionnaires.new.contactNamePlaceholder')} {...field} />
                    </FormControl>
                    <FormDescription>{t('questionnaires.new.contactNameDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendorEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('questionnaires.new.contactEmail')}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder={t('questionnaires.new.contactEmailPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('questionnaires.new.contactEmailDesc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={createAndSendMutation.isPending}
                  className="min-w-[160px]"
                >
                  {createAndSendMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {step === 'sending' ? t('questionnaires.new.sendingEmail') : t('questionnaires.new.creating')}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {t('questionnaires.new.createSend')}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
