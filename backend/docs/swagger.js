/**
 * OpenAPI/Swagger documentation for the RAG API
 * Extracted from app.js for better maintainability
 */

export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'RAG API',
    version: '1.0.0',
    description: 'Retrieval-Augmented Generation API using LangChain, Ollama, and Qdrant',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    {
      url: process.env.API_URL || 'http://localhost:3007',
      description: 'Development server',
    },
  ],
  tags: [
    {
      name: 'RAG',
      description: 'Retrieval-Augmented Generation endpoints',
    },
    {
      name: 'Conversations',
      description: 'Conversation management endpoints',
    },
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
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
    '/api/v1/rag': {
      post: {
        tags: ['RAG'],
        summary: 'Ask a question',
        description: 'Submit a question to the RAG system with optional chat history',
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
                    description: 'The question to ask',
                    example: 'What is this document about?',
                    minLength: 1,
                    maxLength: 5000,
                  },
                  chat_history: {
                    type: 'array',
                    description: 'Optional chat history for context',
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
                    maxItems: 50,
                    example: [
                      { role: 'user', content: 'What is RAG?' },
                      {
                        role: 'assistant',
                        content: 'RAG stands for Retrieval-Augmented Generation...',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'success',
                    },
                    message: {
                      type: 'string',
                      example: 'Question answered successfully',
                    },
                    data: {
                      type: 'object',
                      properties: {
                        answer: {
                          type: 'string',
                          description: 'The generated answer',
                          example: 'Based on the document, this is about...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Bad request - Invalid input',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/conversations': {
      post: {
        tags: ['Conversations'],
        summary: 'Create a new conversation',
        description: 'Create a new conversation for organizing chat history',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Optional title for the conversation',
                    example: 'AI Agents Discussion',
                  },
                  userId: {
                    type: 'string',
                    description: 'Optional user ID (defaults to "anonymous")',
                    example: 'user123',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Conversation created successfully',
          },
        },
      },
      get: {
        tags: ['Conversations'],
        summary: 'Get all conversations',
        description: 'Retrieve all conversations for a user',
        parameters: [
          {
            name: 'userId',
            in: 'query',
            schema: { type: 'string' },
            description: 'User ID to filter conversations',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50 },
            description: 'Number of conversations to return',
          },
          {
            name: 'skip',
            in: 'query',
            schema: { type: 'integer', default: 0 },
            description: 'Number of conversations to skip',
          },
        ],
        responses: {
          200: {
            description: 'Conversations retrieved successfully',
          },
        },
      },
    },
    '/api/v1/conversations/{id}': {
      get: {
        tags: ['Conversations'],
        summary: 'Get a conversation with messages',
        description: 'Retrieve a specific conversation and its messages',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Conversation ID',
          },
        ],
        responses: {
          200: {
            description: 'Conversation retrieved successfully',
          },
          404: {
            description: 'Conversation not found',
          },
        },
      },
      patch: {
        tags: ['Conversations'],
        summary: 'Update conversation',
        description: 'Update conversation details (e.g., title)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Conversation ID',
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'New title for the conversation',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Conversation updated successfully',
          },
          404: {
            description: 'Conversation not found',
          },
        },
      },
      delete: {
        tags: ['Conversations'],
        summary: 'Delete conversation',
        description: 'Delete a conversation and all its messages',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Conversation ID',
          },
        ],
        responses: {
          200: {
            description: 'Conversation deleted successfully',
          },
          404: {
            description: 'Conversation not found',
          },
        },
      },
    },
    '/api/v1/conversations/{id}/ask': {
      post: {
        tags: ['Conversations'],
        summary: 'Ask a question in a conversation',
        description: 'Submit a question to the RAG system within a specific conversation context',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Conversation ID',
          },
        ],
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
                    description: 'The question to ask',
                    example: 'What are AI agents?',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Question answered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    message: { type: 'string', example: 'Question answered successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        answer: { type: 'string' },
                        conversationId: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: {
            description: 'Conversation not found',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['error', 'fail'],
          },
          message: {
            type: 'string',
          },
        },
      },
    },
  },
};
