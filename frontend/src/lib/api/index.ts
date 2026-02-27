export { default as apiClient, getErrorMessage } from './client';
export { authApi } from './auth';
export { conversationsApi } from './conversations';
export { workspacesApi } from './workspaces';
export { ragApi } from './rag';
export { assessmentsApi } from './assessments';
export type { Assessment, Gap, GapLevel, OverallRisk, AssessmentStatus } from './assessments';
export { sourcesApi } from './sources';
export type { DataSource, DataSourceStatus, DataSourceType, CreateDataSourceDto } from './sources';
export { questionnairesApi } from './questionnaires';
export type {
  VendorQuestionnaire,
  QuestionnaireQuestion,
  QuestionnaireStatus,
  GapLevel as QuestionnaireGapLevel,
  CreateQuestionnaireDto,
} from './questionnaires';
