'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAssessmentListQuery } from '@/features/assessments/queries/use-assessment-list-query';
import { useQuestionnaireListQuery } from '@/features/questionnaires/queries/use-questionnaire-list-query';
import { useWorkspaceQuery } from '@/features/workspaces/queries/use-workspace-queries';
import { workspacesApi } from '@/features/workspaces/api/workspaces';
import { useWorkspaceStore } from '@/state/workspace-store';

export function useWorkspaceOverview(workspaceId: string) {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  useEffect(() => {
    if (workspaceId && workspaceId !== activeWorkspaceId) {
      setActiveWorkspace(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId, setActiveWorkspace]);

  const workspaceQuery = useWorkspaceQuery(workspaceId);
  const assessmentsQuery = useAssessmentListQuery({
    workspaceId,
    limit: 50,
    refetchWhileProcessing: true,
  });
  const questionnairesQuery = useQuestionnaireListQuery({ workspaceId });
  const complianceScoreQuery = useQuery({
    queryKey: ['compliance-score', workspaceId],
    queryFn: () => workspacesApi.getComplianceScore(workspaceId),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    workspace: workspaceQuery.data,
    isWorkspaceLoading: workspaceQuery.isLoading,
    assessments: assessmentsQuery.data ?? [],
    isAssessmentsLoading: assessmentsQuery.isLoading,
    isAssessmentsError: assessmentsQuery.isError,
    questionnaires: questionnairesQuery.data ?? [],
    complianceScore: complianceScoreQuery.data ?? null,
  };
}
