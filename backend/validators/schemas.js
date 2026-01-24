import { z } from 'zod';

/**
 * Validation schemas using Zod
 * Provides runtime type checking and input validation
 */

// RAG Endpoint Schemas
export const askQuestionSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(2000, 'Question too long (max 2000 characters)')
    .trim(),
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'),
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
});

// Alias for backwards compatibility
export const askWithConversationSchema = askQuestionSchema;

export const streamQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty').max(2000, 'Question too long').trim(),
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid conversation ID'),
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
});

// Conversation Schemas
export const createConversationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title too long (max 200 characters)')
    .optional(),
  workspaceId: z.string().optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title too long').optional(),
});

// Notion Workspace Schemas
export const connectWorkspaceSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  workspaceName: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name too long'),
  workspaceIcon: z.string().optional(),
  syncIntervalHours: z
    .number()
    .int()
    .min(1)
    .max(168, 'Sync interval too long (max 1 week)')
    .default(6),
});

export const triggerSyncSchema = z.object({
  fullSync: z.boolean().default(false),
});

// Analytics Schemas
export const analyticsSummarySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const popularQuestionsSchema = z.object({
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .default('10'),
});

export const feedbackTrendsSchema = z.object({
  days: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(90))
    .default('7'),
});

export const feedbackSubmitSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  rating: z
    .number()
    .int()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5')
    .optional(),
  helpful: z.boolean().optional(),
  comment: z.string().max(1000, 'Comment too long (max 1000 characters)').optional(),
});

// Keep for backwards compatibility
export const confidenceTrendsSchema = feedbackTrendsSchema;

export const sourceStatsSchema = z.object({
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .default('20'),
});

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
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Password must contain at least one special character'
    )
    .refine(
      (password) => !commonPasswords.includes(password.toLowerCase()),
      'This password is too common. Please choose a stronger password.'
    );

// Authentication Schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: createPasswordSchema(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long').trim(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: createPasswordSchema(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: createPasswordSchema(),
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// MongoDB ID validation
export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

// Pagination schema
export const paginationSchema = z.object({
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
});
