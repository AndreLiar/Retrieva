/**
 * Repository Layer - Barrel Export
 *
 * Implements the Repository Pattern for clean data access abstraction.
 *
 * Benefits:
 * - Decouples business logic from data access
 * - Centralizes complex queries
 * - Makes database switching easier
 * - Enables unit testing with mock repositories
 *
 * Usage:
 *   // Import specific repository
 *   import { analyticsRepository } from './repositories';
 *
 *   // Or import class for custom instances
 *   import { AnalyticsRepository } from './repositories';
 *   const repo = new AnalyticsRepository(mockModel);
 */

// Base class
export { BaseRepository } from './BaseRepository.js';

// Repository classes and singleton instances
export { MessageRepository, messageRepository } from './MessageRepository.js';
export { ConversationRepository, conversationRepository } from './ConversationRepository.js';
export { AssessmentRepository, assessmentRepository } from './AssessmentRepository.js';
export { WorkspaceRepository, workspaceRepository } from './WorkspaceRepository.js';
export { UserRepository, userRepository } from './UserRepository.js';
export { OrganizationRepository, organizationRepository } from './OrganizationRepository.js';
export {
  OrganizationMemberRepository,
  organizationMemberRepository,
} from './OrganizationMemberRepository.js';
export {
  WorkspaceMemberRepository,
  workspaceMemberRepository,
} from './WorkspaceMemberRepository.js';
export {
  QuestionnaireTemplateRepository,
  questionnaireTemplateRepository,
} from './QuestionnaireTemplateRepository.js';
export {
  VendorQuestionnaireRepository,
  vendorQuestionnaireRepository,
} from './VendorQuestionnaireRepository.js';
