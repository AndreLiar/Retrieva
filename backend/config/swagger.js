/**
 * OpenAPI/Swagger documentation for the RAG API
 * Complete API documentation for all endpoints
 */

export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'RAG Platform API',
    version: '1.0.0',
    description: `
# RAG Platform API Documentation

A production-ready Retrieval-Augmented Generation (RAG) platform API built with Express 5, LangChain, Ollama, and Qdrant.

## Features
- **Notion Integration**: Sync and query documents from Notion workspaces
- **Semantic Search**: AI-powered question answering with source citations
- **Multi-tenant Workspaces**: Team collaboration with role-based access
- **Real-time Analytics**: Usage tracking, performance metrics, and insights
- **Security**: JWT authentication, rate limiting, and guardrails

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Rate Limits
- Standard endpoints: 100 requests/hour per user
- RAG endpoints: 50 requests/hour per user
- Auth endpoints: 10 requests/15 minutes per IP
    `,
    contact: {
      name: 'API Support',
      email: 'support@ragplatform.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: process.env.API_URL || 'http://localhost:3007',
      description: 'Development server',
    },
    {
      url: 'https://api.ragplatform.com',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check and monitoring endpoints' },
    { name: 'Authentication', description: 'User registration, login, and token management' },
    { name: 'RAG', description: 'Retrieval-Augmented Generation question answering' },
    { name: 'Conversations', description: 'Conversation and chat history management' },
    { name: 'Workspaces', description: 'Workspace management and member collaboration' },
    { name: 'Notion', description: 'Notion integration and document sync' },
    { name: 'Analytics', description: 'Usage analytics and metrics' },
    { name: 'Notifications', description: 'User notification management' },
    { name: 'Guardrails', description: 'Security monitoring and guardrails' },
    { name: 'Evaluation', description: 'RAGAS evaluation and quality metrics' },
    { name: 'Memory', description: 'Memory system and cache management' },
    { name: 'Activity', description: 'Activity feed and user actions' },
    { name: 'Presence', description: 'Real-time user presence' },
  ],
  paths: {
    // ==================== ROOT & HEALTH ENDPOINTS ====================
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Root health check',
        description: 'Check if the server is running',
        responses: {
          200: {
            description: 'Server is running',
            content: {
              'text/plain': {
                schema: {
                  type: 'string',
                  example: 'Hello from a secure app.js!',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Basic health check',
        description: 'Quick health check for load balancer probes',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/detailed': {
      get: {
        tags: ['Health'],
        summary: 'Detailed health check',
        description: 'Comprehensive health check with dependency status',
        responses: {
          200: {
            description: 'Detailed health information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DetailedHealth' },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Kubernetes readiness probe - checks if service can accept traffic',
        responses: {
          200: { description: 'Service is ready' },
          503: { description: 'Service is not ready' },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Kubernetes liveness probe - checks if service is alive',
        responses: {
          200: { description: 'Service is alive' },
        },
      },
    },

    // ==================== AUTHENTICATION ENDPOINTS ====================
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register new user',
        description: 'Create a new user account and send verification email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          409: { description: 'Email already exists' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        description: 'Authenticate user and receive access/refresh tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          401: { description: 'Invalid credentials' },
          423: { description: 'Account locked due to too many failed attempts' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        description: 'Exchange refresh token for new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', description: 'Valid refresh token' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Token refreshed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenResponse' },
              },
            },
          },
          401: { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'User logout',
        description: 'Invalidate refresh token and end session',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user',
        description: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'User profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/auth/profile': {
      patch: {
        tags: ['Authentication'],
        summary: 'Update profile',
        description: 'Update the authenticated user\'s profile (name only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Display name' },
                  email: {
                    type: 'string',
                    description: 'Must match existing email; changing email is not supported',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated successfully' },
          400: { description: 'Invalid input or unsupported email change' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Request password reset',
        description: 'Send password reset email to user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Reset email sent if account exists' },
        },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset password',
        description: 'Reset password using token from email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string', description: 'Reset token from email' },
                  password: { type: 'string', minLength: 8, description: 'New password' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/api/v1/auth/verify-email': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify email address',
        description: 'Verify email using token from email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Email verified successfully' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/api/v1/auth/resend-verification': {
      post: {
        tags: ['Authentication'],
        summary: 'Resend verification email',
        description: 'Resend email verification link (60s cooldown between requests)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Verification email sent' },
          429: { description: 'Cooldown active. Please wait before requesting again' },
        },
      },
    },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change password',
        description: 'Change password for authenticated user',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          401: { description: 'Current password incorrect' },
        },
      },
    },

    // ==================== RAG ENDPOINTS ====================
    '/api/v1/rag': {
      post: {
        tags: ['RAG'],
        summary: 'Ask a question',
        description:
          'Submit a question to the RAG system. Requires workspace membership. Question is processed through semantic search and LLM generation.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RAGRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Question answered successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RAGResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { description: 'Not a member of this workspace' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/rag/stream': {
      post: {
        tags: ['RAG'],
        summary: 'Stream RAG response',
        description: 'Submit a question and receive streaming response via Server-Sent Events',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RAGRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Streaming response',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Server-Sent Events stream',
                },
              },
            },
          },
        },
      },
    },

    // ==================== CONVERSATION ENDPOINTS ====================
    '/api/v1/conversations': {
      get: {
        tags: ['Conversations'],
        summary: 'List conversations',
        description: 'Get all conversations for the authenticated user in a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceHeader' },
          { $ref: '#/components/parameters/LimitQuery' },
          { $ref: '#/components/parameters/SkipQuery' },
          {
            name: 'sort',
            in: 'query',
            schema: { type: 'string', default: '-updatedAt' },
            description: 'Sort field (prefix with - for descending)',
          },
        ],
        responses: {
          200: {
            description: 'List of conversations',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            conversations: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/Conversation' },
                            },
                            pagination: { $ref: '#/components/schemas/Pagination' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Conversations'],
        summary: 'Create conversation',
        description: 'Create a new conversation in a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Optional conversation title' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Conversation created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Conversation' },
              },
            },
          },
        },
      },
    },
    '/api/v1/conversations/{id}': {
      get: {
        tags: ['Conversations'],
        summary: 'Get conversation',
        description: 'Get a conversation with all messages',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ConversationId' }],
        responses: {
          200: {
            description: 'Conversation with messages',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversationWithMessages' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Conversations'],
        summary: 'Update conversation',
        description: 'Update conversation details',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ConversationId' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  isPinned: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Conversation updated' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Conversations'],
        summary: 'Delete conversation',
        description: 'Delete a conversation and all its messages',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ConversationId' }],
        responses: {
          200: { description: 'Conversation deleted' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/v1/conversations/{id}/ask': {
      post: {
        tags: ['Conversations'],
        summary: 'Ask in conversation',
        description:
          'Ask a question within a conversation context. Uses conversation history for context-aware responses.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ConversationId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 5000,
                    example: 'What are the key points?',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Question answered',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RAGResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/conversations/{id}/feedback': {
      post: {
        tags: ['Conversations'],
        summary: 'Submit feedback',
        description: 'Submit feedback on a message/answer',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ConversationId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FeedbackRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Feedback submitted' },
        },
      },
    },

    // ==================== WORKSPACE ENDPOINTS ====================
    '/api/v1/workspaces/my-workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'Get user workspaces',
        description: 'Get all workspaces the user is a member of',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'List of workspaces',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WorkspaceMembership' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workspaces/{workspaceId}/members': {
      get: {
        tags: ['Workspaces'],
        summary: 'Get workspace members',
        description: 'Get all members of a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          200: {
            description: 'List of members',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WorkspaceMember' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workspaces/{workspaceId}/invite': {
      post: {
        tags: ['Workspaces'],
        summary: 'Invite member',
        description: 'Invite a user to join the workspace (admin/owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['viewer', 'member', 'admin'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Invitation sent' },
          403: { description: 'Insufficient permissions' },
        },
      },
    },
    '/api/v1/workspaces/{workspaceId}/members/{memberId}': {
      patch: {
        tags: ['Workspaces'],
        summary: 'Update member role',
        description: 'Update a workspace member role (admin/owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceId' },
          {
            name: 'memberId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['viewer', 'member', 'admin'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Member role updated' },
        },
      },
      delete: {
        tags: ['Workspaces'],
        summary: 'Remove member',
        description: 'Remove a member from the workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceId' },
          {
            name: 'memberId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Member removed' },
        },
      },
    },

    // ==================== NOTION ENDPOINTS ====================
    '/api/v1/notion/auth': {
      get: {
        tags: ['Notion'],
        summary: 'Start Notion OAuth',
        description: 'Redirect to Notion OAuth authorization page',
        security: [{ bearerAuth: [] }],
        responses: {
          302: { description: 'Redirect to Notion OAuth' },
        },
      },
    },
    '/api/v1/notion/callback': {
      get: {
        tags: ['Notion'],
        summary: 'Notion OAuth callback',
        description: 'Handle OAuth callback from Notion',
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          302: { description: 'Redirect to frontend with success/error' },
        },
      },
    },
    '/api/v1/notion/workspaces': {
      get: {
        tags: ['Notion'],
        summary: 'List Notion workspaces',
        description: 'Get all connected Notion workspaces',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'List of Notion workspaces',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/NotionWorkspace' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}': {
      get: {
        tags: ['Notion'],
        summary: 'Get Notion workspace',
        description: 'Get details of a connected Notion workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Notion workspace details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/NotionWorkspace' },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Notion'],
        summary: 'Update Notion workspace',
        description: 'Update Notion workspace settings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  syncEnabled: { type: 'boolean' },
                  syncInterval: { type: 'integer', minimum: 60 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Workspace updated' },
        },
      },
      delete: {
        tags: ['Notion'],
        summary: 'Delete Notion workspace',
        description: 'Disconnect and delete a Notion workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Workspace deleted' },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}/sync': {
      post: {
        tags: ['Notion'],
        summary: 'Trigger sync',
        description: 'Manually trigger a sync for the Notion workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullSync: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Sync started' },
          409: { description: 'Sync already in progress' },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}/sync-status': {
      get: {
        tags: ['Notion'],
        summary: 'Get sync status',
        description: 'Get current sync status for the workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Sync status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SyncStatus' },
              },
            },
          },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}/sync-history': {
      get: {
        tags: ['Notion'],
        summary: 'Get sync history',
        description: 'Get sync job history for the workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: {
          200: {
            description: 'Sync history',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SyncJob' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}/pages': {
      get: {
        tags: ['Notion'],
        summary: 'List Notion pages',
        description: 'Get available Notion pages for syncing',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'List of pages' },
        },
      },
    },
    '/api/v1/notion/workspaces/{id}/databases': {
      get: {
        tags: ['Notion'],
        summary: 'List Notion databases',
        description: 'Get available Notion databases for syncing',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'List of databases' },
        },
      },
    },

    // ==================== ANALYTICS ENDPOINTS ====================
    '/api/v1/analytics/summary': {
      get: {
        tags: ['Analytics'],
        summary: 'Get analytics summary',
        description: 'Get high-level analytics summary for a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceHeader' },
          {
            name: 'period',
            in: 'query',
            schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'week' },
          },
        ],
        responses: {
          200: {
            description: 'Analytics summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnalyticsSummary' },
              },
            },
          },
        },
      },
    },
    '/api/v1/analytics/popular-questions': {
      get: {
        tags: ['Analytics'],
        summary: 'Get popular questions',
        description: 'Get most frequently asked questions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceHeader' },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: {
          200: { description: 'Popular questions' },
        },
      },
    },
    '/api/v1/analytics/feedback-trends': {
      get: {
        tags: ['Analytics'],
        summary: 'Get feedback trends',
        description: 'Get user feedback trends over time',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Feedback trends' },
        },
      },
    },
    '/api/v1/analytics/source-stats': {
      get: {
        tags: ['Analytics'],
        summary: 'Get source statistics',
        description: 'Get statistics about document sources',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Source statistics' },
        },
      },
    },
    '/api/v1/analytics/cache-stats': {
      get: {
        tags: ['Analytics'],
        summary: 'Get cache statistics',
        description: 'Get RAG cache hit/miss statistics',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Cache statistics' },
        },
      },
    },
    '/api/v1/analytics/feedback': {
      post: {
        tags: ['Analytics'],
        summary: 'Submit feedback',
        description: 'Submit feedback for an answer',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FeedbackRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Feedback recorded' },
        },
      },
    },

    // ==================== NOTIFICATION ENDPOINTS ====================
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notifications',
        description: 'Get user notifications with optional filtering',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/LimitQuery' },
          { $ref: '#/components/parameters/SkipQuery' },
          {
            name: 'unreadOnly',
            in: 'query',
            schema: { type: 'boolean', default: false },
          },
        ],
        responses: {
          200: {
            description: 'List of notifications',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Notification' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notifications/count': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notification count',
        description: 'Get count of unread notifications',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Notification count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    unread: { type: 'integer' },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/notifications/preferences': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notification preferences',
        description: 'Get user notification preferences',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Notification preferences' },
        },
      },
      put: {
        tags: ['Notifications'],
        summary: 'Update notification preferences',
        description: 'Update user notification preferences',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotificationPreferences' },
            },
          },
        },
        responses: {
          200: { description: 'Preferences updated' },
        },
      },
    },
    '/api/v1/notifications/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all as read',
        description: 'Mark all notifications as read',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Notifications marked as read' },
        },
      },
    },
    '/api/v1/notifications/{notificationId}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        description: 'Mark a specific notification as read',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'notificationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Notification marked as read' },
        },
      },
    },
    '/api/v1/notifications/{notificationId}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Delete notification',
        description: 'Delete a notification',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'notificationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Notification deleted' },
        },
      },
    },

    // ==================== GUARDRAILS ENDPOINTS ====================
    '/api/v1/guardrails/status': {
      get: {
        tags: ['Guardrails'],
        summary: 'Get guardrails status',
        description: 'Get current status of all guardrails',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Guardrails status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GuardrailsStatus' },
              },
            },
          },
        },
      },
    },
    '/api/v1/guardrails/security': {
      get: {
        tags: ['Guardrails'],
        summary: 'Get security metrics',
        description: 'Get security-related metrics and statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Security metrics' },
        },
      },
    },
    '/api/v1/guardrails/security/events': {
      get: {
        tags: ['Guardrails'],
        summary: 'Get security events',
        description: 'Get recent security events and alerts',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/LimitQuery' },
          {
            name: 'severity',
            in: 'query',
            schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
        ],
        responses: {
          200: { description: 'Security events' },
        },
      },
    },
    '/api/v1/guardrails/tokens': {
      get: {
        tags: ['Guardrails'],
        summary: 'Get token usage',
        description: 'Get token usage statistics',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Token usage' },
        },
      },
    },
    '/api/v1/guardrails/audit': {
      get: {
        tags: ['Guardrails'],
        summary: 'Get audit log',
        description: 'Get audit trail of actions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/LimitQuery' },
          { $ref: '#/components/parameters/SkipQuery' },
          {
            name: 'action',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by action type',
          },
        ],
        responses: {
          200: { description: 'Audit log' },
        },
      },
    },
    '/api/v1/guardrails/audit/export': {
      get: {
        tags: ['Guardrails'],
        summary: 'Export audit log',
        description: 'Export audit log as CSV',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'CSV export',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },

    // ==================== EVALUATION ENDPOINTS ====================
    '/api/v1/evaluation/status': {
      get: {
        tags: ['Evaluation'],
        summary: 'Get evaluation service status',
        description: 'Check if RAGAS evaluation service is available',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Service status' },
        },
      },
    },
    '/api/v1/evaluation/health': {
      get: {
        tags: ['Evaluation'],
        summary: 'Get evaluation service health',
        description: 'Detailed health check of evaluation service',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Service health' },
        },
      },
    },
    '/api/v1/evaluation/evaluate': {
      post: {
        tags: ['Evaluation'],
        summary: 'Evaluate RAG response',
        description: 'Evaluate a RAG response using RAGAS metrics',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EvaluationRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Evaluation results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EvaluationResult' },
              },
            },
          },
        },
      },
    },
    '/api/v1/evaluation/batch': {
      post: {
        tags: ['Evaluation'],
        summary: 'Batch evaluate',
        description: 'Evaluate multiple RAG responses in batch',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['evaluations'],
                properties: {
                  evaluations: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/EvaluationRequest' },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Batch evaluation results' },
        },
      },
    },
    '/api/v1/evaluation/metrics': {
      get: {
        tags: ['Evaluation'],
        summary: 'Get evaluation metrics',
        description: 'Get aggregated evaluation metrics',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Evaluation metrics' },
        },
      },
    },

    // ==================== MEMORY ENDPOINTS ====================
    '/api/v1/memory/dashboard': {
      get: {
        tags: ['Memory'],
        summary: 'Get memory dashboard',
        description: 'Get overview of memory system status',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Memory dashboard' },
        },
      },
    },
    '/api/v1/memory/cache': {
      get: {
        tags: ['Memory'],
        summary: 'Get cache status',
        description: 'Get RAG cache status and statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Cache status' },
        },
      },
    },
    '/api/v1/memory/entities': {
      get: {
        tags: ['Memory'],
        summary: 'Get entity memory',
        description: 'Get extracted entities from conversations',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceHeader' }],
        responses: {
          200: { description: 'Entity list' },
        },
      },
    },
    '/api/v1/memory/decay/stats': {
      get: {
        tags: ['Memory'],
        summary: 'Get decay statistics',
        description: 'Get memory decay statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Decay statistics' },
        },
      },
    },
    '/api/v1/memory/decay/trigger': {
      post: {
        tags: ['Memory'],
        summary: 'Trigger memory decay',
        description: 'Manually trigger memory decay process',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Decay triggered' },
        },
      },
    },

    // ==================== ACTIVITY ENDPOINTS ====================
    '/api/v1/activity/me/history': {
      get: {
        tags: ['Activity'],
        summary: 'Get my activity history',
        description: 'Get authenticated user activity history',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/LimitQuery' },
          { $ref: '#/components/parameters/SkipQuery' },
        ],
        responses: {
          200: { description: 'Activity history' },
        },
      },
    },
    '/api/v1/activity/{workspaceId}': {
      get: {
        tags: ['Activity'],
        summary: 'Get workspace activity',
        description: 'Get activity feed for a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/WorkspaceId' },
          { $ref: '#/components/parameters/LimitQuery' },
        ],
        responses: {
          200: { description: 'Workspace activity' },
        },
      },
    },
    '/api/v1/activity/{workspaceId}/stats': {
      get: {
        tags: ['Activity'],
        summary: 'Get activity statistics',
        description: 'Get activity statistics for a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          200: { description: 'Activity statistics' },
        },
      },
    },
    '/api/v1/activity/{workspaceId}/trending': {
      get: {
        tags: ['Activity'],
        summary: 'Get trending topics',
        description: 'Get trending topics in the workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          200: { description: 'Trending topics' },
        },
      },
    },

    // ==================== PRESENCE ENDPOINTS ====================
    '/api/v1/presence/stats': {
      get: {
        tags: ['Presence'],
        summary: 'Get presence statistics',
        description: 'Get overall presence statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Presence statistics' },
        },
      },
    },
    '/api/v1/presence/{workspaceId}': {
      get: {
        tags: ['Presence'],
        summary: 'Get workspace presence',
        description: 'Get online users in a workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          200: {
            description: 'Online users',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PresenceInfo' },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/presence/{workspaceId}/count': {
      get: {
        tags: ['Presence'],
        summary: 'Get online count',
        description: 'Get count of online users in workspace',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          200: {
            description: 'Online count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // ==================== COMPONENTS ====================
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
    },
    parameters: {
      WorkspaceHeader: {
        name: 'X-Workspace-Id',
        in: 'header',
        required: true,
        schema: { type: 'string' },
        description: 'Workspace ID for the request',
      },
      WorkspaceId: {
        name: 'workspaceId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Workspace ID',
      },
      ConversationId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Conversation ID',
      },
      LimitQuery: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
        description: 'Number of items to return',
      },
      SkipQuery: {
        name: 'skip',
        in: 'query',
        schema: { type: 'integer', default: 0, minimum: 0 },
        description: 'Number of items to skip',
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request - Invalid input',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Unauthorized: {
        description: 'Unauthorized - Invalid or missing token',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden - Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFound: {
        description: 'Not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['error', 'fail'] },
          message: { type: 'string' },
          code: { type: 'string' },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          skip: { type: 'integer' },
          page: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
          name: { type: 'string', minLength: 2, example: 'John Doe' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
      TokenResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
          isActive: { type: 'boolean' },
          isEmailVerified: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      RAGRequest: {
        type: 'object',
        required: ['question'],
        properties: {
          question: {
            type: 'string',
            minLength: 1,
            maxLength: 5000,
            description: 'The question to ask',
            example: 'What is this document about?',
          },
          chat_history: {
            type: 'array',
            description: 'Optional chat history for context. Provides conversation context for follow-up questions.',
            maxItems: 50,
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: {
                  type: 'string',
                  enum: ['user', 'assistant'],
                  description: 'The role of the message sender',
                },
                content: {
                  type: 'string',
                  description: 'The message content',
                },
              },
            },
            example: [
              { role: 'user', content: 'What is RAG?' },
              { role: 'assistant', content: 'RAG stands for Retrieval-Augmented Generation...' },
            ],
          },
          conversationId: {
            type: 'string',
            description: 'Optional conversation ID to continue an existing conversation',
          },
        },
      },
      RAGResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: 'Generated answer' },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    url: { type: 'string' },
                    snippet: { type: 'string' },
                  },
                },
              },
              conversationId: { type: 'string' },
              messageId: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              processingTime: { type: 'integer', description: 'Time in ms' },
            },
          },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          userId: { type: 'string' },
          workspaceId: { type: 'string' },
          messageCount: { type: 'integer' },
          isPinned: { type: 'boolean' },
          lastMessageAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ConversationWithMessages: {
        allOf: [
          { $ref: '#/components/schemas/Conversation' },
          {
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                items: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        ],
      },
      Message: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          conversationId: { type: 'string' },
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          content: { type: 'string' },
          sources: { type: 'array', items: { type: 'object' } },
          feedback: {
            type: 'object',
            properties: {
              rating: { type: 'integer', minimum: 1, maximum: 5 },
              comment: { type: 'string' },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      FeedbackRequest: {
        type: 'object',
        required: ['messageId', 'rating'],
        properties: {
          messageId: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string', maxLength: 1000 },
          tags: {
            type: 'array',
            items: { type: 'string', enum: ['helpful', 'accurate', 'incomplete', 'incorrect', 'irrelevant'] },
          },
        },
      },
      WorkspaceMembership: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          workspaceName: { type: 'string' },
          role: { type: 'string', enum: ['viewer', 'member', 'admin', 'owner'] },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
      WorkspaceMember: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['viewer', 'member', 'admin', 'owner'] },
          joinedAt: { type: 'string', format: 'date-time' },
          isOnline: { type: 'boolean' },
        },
      },
      NotionWorkspace: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          notionWorkspaceId: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          syncEnabled: { type: 'boolean' },
          lastSyncAt: { type: 'string', format: 'date-time' },
          documentCount: { type: 'integer' },
          status: { type: 'string', enum: ['active', 'syncing', 'error', 'disconnected'] },
        },
      },
      SyncStatus: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['idle', 'syncing', 'completed', 'failed'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          currentPage: { type: 'string' },
          pagesProcessed: { type: 'integer' },
          totalPages: { type: 'integer' },
          startedAt: { type: 'string', format: 'date-time' },
          estimatedCompletion: { type: 'string', format: 'date-time' },
        },
      },
      SyncJob: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          workspaceId: { type: 'string' },
          status: { type: 'string' },
          pagesProcessed: { type: 'integer' },
          documentsIndexed: { type: 'integer' },
          errors: { type: 'array', items: { type: 'string' } },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          duration: { type: 'integer', description: 'Duration in seconds' },
        },
      },
      AnalyticsSummary: {
        type: 'object',
        properties: {
          questionsAsked: { type: 'integer' },
          averageResponseTime: { type: 'number' },
          cacheHitRate: { type: 'number' },
          feedbackScore: { type: 'number' },
          activeUsers: { type: 'integer' },
          documentsIndexed: { type: 'integer' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          isRead: { type: 'boolean' },
          data: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      NotificationPreferences: {
        type: 'object',
        properties: {
          inApp: {
            type: 'object',
            properties: {
              workspace_invitation: { type: 'boolean' },
              sync_completed: { type: 'boolean' },
              sync_failed: { type: 'boolean' },
            },
          },
          email: {
            type: 'object',
            properties: {
              workspace_invitation: { type: 'boolean' },
              sync_failed: { type: 'boolean' },
            },
          },
        },
      },
      GuardrailsStatus: {
        type: 'object',
        properties: {
          promptInjectionDetection: { type: 'boolean' },
          piiMasking: { type: 'boolean' },
          outputSanitization: { type: 'boolean' },
          rateLimiting: { type: 'boolean' },
          tokenBudget: {
            type: 'object',
            properties: {
              used: { type: 'integer' },
              limit: { type: 'integer' },
              remaining: { type: 'integer' },
            },
          },
        },
      },
      EvaluationRequest: {
        type: 'object',
        required: ['question', 'answer', 'contexts'],
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          contexts: {
            type: 'array',
            items: { type: 'string' },
          },
          groundTruth: { type: 'string', description: 'Expected answer for comparison' },
        },
      },
      EvaluationResult: {
        type: 'object',
        properties: {
          faithfulness: { type: 'number', minimum: 0, maximum: 1 },
          answerRelevancy: { type: 'number', minimum: 0, maximum: 1 },
          contextRelevancy: { type: 'number', minimum: 0, maximum: 1 },
          contextPrecision: { type: 'number', minimum: 0, maximum: 1 },
          overallScore: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      PresenceInfo: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['online', 'away', 'busy'] },
          lastSeenAt: { type: 'string', format: 'date-time' },
          currentConversation: { type: 'string' },
        },
      },
      DetailedHealth: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          timestamp: { type: 'string', format: 'date-time' },
          version: { type: 'string' },
          uptime: { type: 'integer' },
          dependencies: {
            type: 'object',
            properties: {
              mongodb: { type: 'string', enum: ['connected', 'disconnected'] },
              redis: { type: 'string', enum: ['connected', 'disconnected'] },
              qdrant: { type: 'string', enum: ['connected', 'disconnected'] },
              ollama: { type: 'string', enum: ['connected', 'disconnected'] },
            },
          },
        },
      },
    },
  },
};
