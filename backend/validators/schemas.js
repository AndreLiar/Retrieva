import { z } from 'zod';

/**
 * Validation schemas using Zod
 * Provides runtime type checking and input validation
 */

/**
 * ISSUE #38 FIX: Sanitize strings to prevent XSS attacks
 * Escapes HTML entities that could be used for script injection
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string with HTML entities escaped
 */
function sanitizeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// RAG Endpoint Schemas
export const askQuestionSchema = z
  .object({
    question: z
      .string()
      .min(1, 'Question cannot be empty')
      .max(2000, 'Question too long (max 2000 characters)')
      .trim(),
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'),
    // workspaceId may arrive in the body (requireWorkspaceAccess also reads it from
    // the X-Workspace-Id header); declare it so .strict() doesn't reject it.
    workspaceId: z.string().max(64).optional(),
    // UI locale (e.g. 'fr', 'en-US') — drives language-aware regulation source links.
    lang: z.string().max(10).optional(),
    filters: z
      .object({
        page: z.number().int().positive().optional(),
        section: z.string().optional(),
        pageRange: z
          .object({
            start: z.number().int().positive(),
            end: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// Alias for backwards compatibility
export const askWithConversationSchema = askQuestionSchema;

export const streamQuestionSchema = z
  .object({
    question: z.string().min(1, 'Question cannot be empty').max(2000, 'Question too long').trim(),
    conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'),
    // See askQuestionSchema: workspaceId may be sent in the body.
    workspaceId: z.string().max(64).optional(),
    // UI locale (e.g. 'fr', 'en-US') — drives language-aware regulation source links.
    lang: z.string().max(10).optional(),
    filters: z
      .object({
        page: z.number().int().positive().optional(),
        section: z.string().optional(),
        pageRange: z
          .object({
            start: z.number().int().positive(),
            end: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// Conversation Schemas
// ISSUE #38 FIX: Added .transform(sanitizeHtml) to sanitize title and prevent XSS
export const createConversationSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title too long (max 200 characters)')
      .transform(sanitizeHtml)
      .optional(),
    workspaceId: z.string().max(64).optional(),
    idempotencyKey: z.string().max(128).optional(),
  })
  .strict();

export const updateConversationSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title too long')
      .transform(sanitizeHtml),
  })
  .strict();

export const askInConversationSchema = z
  .object({
    question: z
      .string()
      .min(1, 'Question cannot be empty')
      .max(5000, 'Question too long (max 5000 characters)')
      .trim(),
    filters: z
      .object({
        page: z.number().int().positive().optional(),
        section: z.string().max(200).optional(),
        pageRange: z
          .object({
            start: z.number().int().positive(),
            end: z.number().int().positive(),
          })
          .optional(),
      })
      .optional()
      .nullable(),
  })
  .strict();

export const bulkDeleteConversationsSchema = z
  .object({
    ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'))
      .min(1, 'ids array is required')
      .max(100, 'Cannot delete more than 100 conversations at once'),
  })
  .strict();

// Analytics Schemas
export const analyticsSummarySchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .strict();

export const popularQuestionsSchema = z
  .object({
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(100))
      .default('10'),
  })
  .strict();

export const feedbackTrendsSchema = z
  .object({
    days: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(90))
      .default('7'),
  })
  .strict();

export const feedbackSubmitSchema = z
  .object({
    requestId: z.string().min(1, 'Request ID is required'),
    rating: z
      .number()
      .int()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must be at most 5')
      .optional(),
    helpful: z.boolean().optional(),
    comment: z.string().max(1000, 'Comment too long (max 1000 characters)').optional(),
  })
  .strict();

// Keep for backwards compatibility
export const confidenceTrendsSchema = feedbackTrendsSchema;

export const sourceStatsSchema = z
  .object({
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(100))
      .default('20'),
  })
  .strict();

/**
 * Common passwords to reject
 */
const commonPasswords = [
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'letmein',
  'welcome',
  'admin123',
  'login123',
  'abc12345',
  'monkey123',
  'master123',
  'dragon123',
  'iloveyou',
  'trustno1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'passw0rd',
  'shadow123',
  'michael1',
  'jennifer',
  'password!',
];

/**
 * One-time-token validator. Used for password reset, email verification,
 * and org invite tokens. Min 20 chars to reject trivial inputs, max 512 to
 * bound payload size, restricted to URL-safe characters.
 */
const oneTimeTokenSchema = z
  .string()
  .min(20, 'Token is too short')
  .max(512, 'Token is too long')
  .regex(/^[A-Za-z0-9._\-+/=]+$/, 'Token contains invalid characters');

/**
 * Strong password validation schema
 */
const createPasswordSchema = () =>
  z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
      'Password must contain at least one special character'
    )
    .refine(
      (password) => !commonPasswords.includes(password.toLowerCase()),
      'This password is too common. Please choose a stronger password.'
    );

// Authentication Schemas
export const registerSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
    password: createPasswordSchema(),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long').trim(),
    role: z.enum(['user', 'admin']).default('user'),
    inviteToken: oneTimeTokenSchema.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
    password: z.string().min(1, 'Password is required').max(100),
  })
  .strict();

// Refresh token can come from cookies or body, so make body validation optional
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token is required').max(2048).optional(),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: oneTimeTokenSchema,
    password: createPasswordSchema(),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: oneTimeTokenSchema,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name too long')
      .trim()
      .optional(),
    email: z.string().email('Invalid email address').toLowerCase().optional(),
  })
  .strict()
  .refine((data) => data.name || data.email, {
    message: 'At least one field must be provided',
    path: ['name'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: createPasswordSchema(),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// MFA (TOTP) schemas — audit gap A1.
// `code` accepts a 6-digit TOTP or an 11-char recovery code (xxxxx-xxxxx).
export const mfaEnableSchema = z
  .object({
    token: z.string().min(6, 'Code must be 6 digits').max(10),
  })
  .strict();

export const mfaVerifySchema = z
  .object({
    mfaToken: z.string().min(10, 'MFA token is required').max(1024),
    code: z.string().min(6, 'Enter your 6-digit code or a recovery code').max(20),
  })
  .strict();

export const mfaDisableSchema = z
  .object({
    password: z.string().min(1, 'Password is required').max(100),
    code: z.string().min(6, 'Enter your 6-digit code or a recovery code').max(20),
  })
  .strict();

// MongoDB ID validation
export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

// Workspace Schemas
export const createWorkspaceSchema = z
  .object({
    name: z.string().min(1, 'Workspace name is required').max(200, 'Name too long').trim(),
    description: z.string().max(2000, 'Description too long').optional(),
    vendorTier: z.enum(['critical', 'important', 'standard']).nullable().optional(),
    serviceType: z.enum(['cloud', 'software', 'data', 'network', 'other']).nullable().optional(),
    country: z.string().max(100, 'Country too long').optional(),
    contractStart: z.string().max(50).optional().nullable(),
    contractEnd: z.string().max(50).optional().nullable(),
    vendorFunctions: z.array(z.string().max(200)).max(50, 'Too many vendor functions').optional(),
  })
  .strict();

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(2000, 'Description too long').optional(),
    vendorTier: z.enum(['critical', 'important', 'standard']).nullable().optional(),
    serviceType: z.enum(['cloud', 'software', 'data', 'network', 'other']).nullable().optional(),
    country: z.string().max(100, 'Country too long').optional(),
    contractStart: z.string().max(50).optional().nullable(),
    contractEnd: z.string().max(50).optional().nullable(),
    nextReviewDate: z.string().max(50).optional().nullable(),
    vendorStatus: z.enum(['active', 'under-review', 'exited']).optional(),
    certifications: z.array(z.string().max(200)).max(50, 'Too many certifications').optional(),
    exitStrategyDoc: z.string().max(2000).optional().nullable(),
    vendorFunctions: z.array(z.string().max(200)).max(50, 'Too many vendor functions').optional(),
  })
  .strict();

export const inviteMemberSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
    role: z.enum(['member', 'viewer']).default('member'),
  })
  .strict();

// Assessment Schemas
export const createAssessmentSchema = z
  .object({
    name: z.string().min(1, 'Assessment name is required').max(200, 'Name too long').trim(),
    vendorName: z
      .string()
      .min(1, 'Vendor name is required')
      .max(200, 'Vendor name too long')
      .trim(),
    framework: z.enum(['DORA', 'CONTRACT_A30']).default('DORA'),
    workspaceId: mongoIdSchema,
    // JSON-encoded array of category keys, one per uploaded file in order (#395).
    categories: z.string().optional(),
  })
  .strict();

export const setRiskDecisionSchema = z
  .object({
    decision: z.enum(['proceed', 'conditional', 'reject'], {
      errorMap: () => ({ message: "decision must be 'proceed', 'conditional', or 'reject'" }),
    }),
    rationale: z.string().max(5000).optional(),
  })
  .strict();

export const setClauseSignoffSchema = z
  .object({
    clauseRef: z.string().min(1, 'clauseRef is required').max(200),
    status: z.enum(['accepted', 'rejected', 'waived'], {
      errorMap: () => ({ message: "status must be 'accepted', 'rejected', or 'waived'" }),
    }),
    note: z.string().max(5000).optional(),
  })
  .strict();

// Pagination schema
export const paginationSchema = z
  .object({
    page: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1))
      .default('1'),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(100))
      .default('10'),
  })
  .strict();

// ---------------------------------------------------------------------------
// List/query schemas for paginated GET routes (applied via validateQuery).
//
// These are deliberately NOT .strict(): GET endpoints commonly receive extra
// query params (cache-busters, future filters) and rejecting them would break
// clients. The goal here is to bound page/limit (a DoS guard — controllers
// still clamp) and validate the known filters. Bounds are generous so normal
// requests never trip them.
// ---------------------------------------------------------------------------

const pageQueryParam = z
  .string()
  .regex(/^\d{1,7}$/, 'page must be a positive integer')
  .transform((v) => parseInt(v, 10))
  .pipe(z.number().int().min(1))
  .optional();

const limitQueryParam = z
  .string()
  .regex(/^\d{1,7}$/, 'limit must be a positive integer')
  .transform((v) => parseInt(v, 10))
  .pipe(z.number().int().min(1).max(1000))
  .optional();

// Assessments + questionnaires share the same filter shape.
export const listAssessmentsQuerySchema = z.object({
  workspaceId: mongoIdSchema.optional(),
  status: z.string().max(40).optional(),
  page: pageQueryParam,
  limit: limitQueryParam,
});

export const listQuestionnairesQuerySchema = listAssessmentsQuerySchema;

export const listConversationsQuerySchema = z.object({
  workspaceId: mongoIdSchema.optional(),
  page: pageQueryParam,
  limit: limitQueryParam,
  skip: z
    .string()
    .regex(/^\d{1,9}$/, 'skip must be a non-negative integer')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0))
    .optional(),
});

// ---------------------------------------------------------------------------
// Organization Schemas
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z
  .object({
    name: z.string().min(1, 'Organization name is required').max(200, 'Name too long').trim(),
    industry: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
  })
  .strict();

export const inviteOrgMemberSchema = z
  .object({
    email: z.string().email('Invalid email address').toLowerCase(),
    role: z.enum(['org_admin', 'analyst', 'viewer']).default('analyst'),
  })
  .strict();

export const acceptOrgInviteSchema = z
  .object({
    token: oneTimeTokenSchema,
  })
  .strict();

export const orgInviteInfoQuerySchema = z
  .object({
    token: oneTimeTokenSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Questionnaire Schemas
// ---------------------------------------------------------------------------

export const createQuestionnaireSchema = z
  .object({
    vendorName: z.string().min(1, 'Vendor name is required').max(200).trim(),
    vendorEmail: z.string().email('Invalid vendor email').toLowerCase(),
    vendorContactName: z.string().max(200).optional(),
    workspaceId: mongoIdSchema,
  })
  .strict();

// /send currently takes no body, but accept-but-ignore-extras is a footgun.
export const sendQuestionnaireSchema = z.object({}).strict();

// Public endpoint — bound aggressively. answers ≤ 200 items, each answer ≤ 10k chars.
export const submitQuestionnaireResponseSchema = z
  .object({
    answers: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          answer: z.string().max(10000).optional().nullable(),
        })
      )
      .max(200, 'Too many answers'),
    final: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const updateOnboardingSchema = z
  .object({
    completed: z.boolean().optional(),
    checklist: z
      .object({
        vendorCreated: z.boolean().optional(),
        assessmentCreated: z.boolean().optional(),
        memberInvited: z.boolean().optional(),
        monitoringSetup: z.boolean().optional(),
        dismissed: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((d) => d.completed !== undefined || d.checklist, {
    message: 'No valid fields to update',
  });

// ---------------------------------------------------------------------------
// URL-param schemas (apply via validateParams)
// ---------------------------------------------------------------------------

export const idParamsSchema = z.object({ id: mongoIdSchema });
export const memberIdParamsSchema = z.object({ memberId: mongoIdSchema });
export const workspaceIdParamsSchema = z.object({ workspaceId: mongoIdSchema });

// Combined :id + :docIndex for assessment file download
export const assessmentFileParamsSchema = z.object({
  id: mongoIdSchema,
  docIndex: z
    .string()
    .regex(/^\d{1,4}$/, 'docIndex must be a small non-negative integer')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(999)),
});

// Public token-shaped routes (questionnaire respond, org invite-info).
// The token is a URL-safe random string; allow a generous but bounded range.
export const tokenParamsSchema = z.object({
  token: z
    .string()
    .min(8, 'Token is too short')
    .max(256, 'Token is too long')
    .regex(/^[A-Za-z0-9._\-+/=]+$/, 'Token contains invalid characters'),
});
