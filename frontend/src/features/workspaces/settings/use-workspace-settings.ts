'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { questionnairesApi } from '@/features/questionnaires/api/questionnaires';
import { workspacesApi } from '@/features/workspaces/api/workspaces';
import { useWorkspaceQuery } from '@/features/workspaces/queries/use-workspace-queries';
import { usePermissions } from '@/shared/hooks/use-permissions';
import {
  SettingsFormData,
  toDateInputValue,
  workspaceSettingsSchema,
} from '@/features/workspaces/settings/workspace-settings-schema';

export function useWorkspaceSettings(workspaceId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isWorkspaceOwner } = usePermissions();
  const { data: workspace } = useWorkspaceQuery(workspaceId);

  const latestQuestionnaireQuery = useQuery({
    queryKey: ['questionnaire-score-card', workspaceId],
    queryFn: async () => {
      const response = await questionnairesApi.list({
        workspaceId,
        status: 'complete',
        limit: 1,
        page: 1,
      });
      return response.data?.questionnaires?.[0] ?? null;
    },
    enabled: !!workspaceId,
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

  const certificationsFieldArray = useFieldArray({
    control: form.control,
    name: 'certifications',
  });

  const vendorFunctions = useWatch({
    control: form.control,
    name: 'vendorFunctions',
    defaultValue: [],
  });

  useEffect(() => {
    if (!workspace) return;

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
      certifications:
        workspace.certifications?.map((certification) => ({
          type: certification.type,
          validUntil: toDateInputValue(certification.validUntil),
        })) ?? [],
      vendorFunctions: (workspace.vendorFunctions ?? []) as SettingsFormData['vendorFunctions'],
    });
  }, [workspace, form]);

  useEffect(() => {
    if (workspace && !isWorkspaceOwner) {
      router.replace(`/workspaces/${workspaceId}`);
      toast.error('You do not have permission to access workspace settings');
    }
  }, [workspace, isWorkspaceOwner, router, workspaceId]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      await workspacesApi.update(workspaceId, {
        name: data.name,
        description: data.description,
        vendorTier: data.vendorTier,
        country: data.country,
        serviceType: data.serviceType,
        contractStart: data.contractStart || null,
        contractEnd: data.contractEnd || null,
        nextReviewDate: data.nextReviewDate || null,
        vendorStatus: data.vendorStatus,
        certifications: data.certifications?.map((certification) => ({
          type: certification.type,
          validUntil: certification.validUntil,
        })),
        vendorFunctions: data.vendorFunctions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace updated successfully');
    },
    onError: () => {
      toast.error('Failed to update workspace');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await workspacesApi.delete(workspaceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.removeQueries({ queryKey: ['workspace', workspaceId] });
      toast.success('Workspace deleted');
      router.push('/workspaces');
    },
    onError: () => {
      toast.error('Failed to delete workspace');
    },
  });

  return {
    workspace,
    isWorkspaceOwner,
    form,
    certificationsFieldArray,
    vendorFunctions,
    latestQuestionnaire: latestQuestionnaireQuery.data,
    isQuestionnaireLoading: latestQuestionnaireQuery.isLoading,
    updateMutation,
    deleteMutation,
  };
}
