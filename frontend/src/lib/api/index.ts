export { default as apiClient, getErrorMessage } from '@/shared/api/client';
export { authApi } from '@/shared/api/auth';
export { billingApi } from '@/shared/api/billing';
export { organizationsApi } from '@/shared/api/organizations';
export { conversationsApi } from '@/features/chat/api/conversations';
export { workspacesApi } from '@/features/workspaces/api/workspaces';
export { ragApi } from '@/features/chat/api/rag';
export { assessmentsApi } from '@/features/assessments/api/assessments';
export type {
  Assessment,
  Gap,
  GapLevel,
  OverallRisk,
  AssessmentStatus,
} from '@/features/assessments/api/assessments';
export { questionnairesApi } from '@/features/questionnaires/api/questionnaires';
export type {
  VendorQuestionnaire,
  QuestionnaireQuestion,
  QuestionnaireStatus,
  GapLevel as QuestionnaireGapLevel,
  CreateQuestionnaireDto,
} from '@/features/questionnaires/api/questionnaires';
