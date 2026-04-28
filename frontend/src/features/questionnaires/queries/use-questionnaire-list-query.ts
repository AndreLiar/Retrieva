'use client';

import { useQuery } from '@tanstack/react-query';

import { questionnairesApi } from '@/features/questionnaires/api/questionnaires';

interface UseQuestionnaireListQueryOptions {
  workspaceId?: string | null;
  limit?: number;
  status?: string;
  page?: number;
  refetchWhileActive?: boolean;
}

export function useQuestionnaireListQuery({
  workspaceId,
  limit = 50,
  status,
  page,
  refetchWhileActive = false,
}: UseQuestionnaireListQueryOptions = {}) {
  return useQuery({
    queryKey: ['questionnaires', workspaceId ?? 'all', status ?? 'all', limit, page ?? 1],
    queryFn: async () => {
      const response = await questionnairesApi.list({
        ...(workspaceId ? { workspaceId } : {}),
        ...(status ? { status } : {}),
        ...(page ? { page } : {}),
        limit,
      });
      return response.data?.questionnaires ?? [];
    },
    refetchInterval: refetchWhileActive
      ? (query) => {
          const questionnaires = query.state.data;
          const hasActiveQuestionnaire = questionnaires?.some(
            (questionnaire) =>
              questionnaire.status === 'sent' || questionnaire.status === 'partial'
          );
          return hasActiveQuestionnaire ? 5000 : false;
        }
      : false,
  });
}
