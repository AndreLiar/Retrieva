'use client';

import { useQuery } from '@tanstack/react-query';

import { assessmentsApi } from '@/features/assessments/api/assessments';

interface UseAssessmentListQueryOptions {
  workspaceId?: string | null;
  limit?: number;
  refetchWhileProcessing?: boolean;
}

export function useAssessmentListQuery({
  workspaceId,
  limit = 50,
  refetchWhileProcessing = false,
}: UseAssessmentListQueryOptions = {}) {
  return useQuery({
    queryKey: ['assessments', workspaceId ?? 'all', limit],
    queryFn: async () => {
      const response = await assessmentsApi.list({
        ...(workspaceId ? { workspaceId } : {}),
        limit,
      });
      return response.data?.assessments ?? [];
    },
    refetchInterval: refetchWhileProcessing
      ? (query) => {
          const assessments = query.state.data;
          const hasProcessingAssessment = assessments?.some(
            (assessment) => assessment.status === 'indexing' || assessment.status === 'analyzing'
          );
          return hasProcessingAssessment ? 5000 : false;
        }
      : false,
  });
}
