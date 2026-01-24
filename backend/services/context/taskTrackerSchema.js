/**
 * Task Tracker Schema and Prompts
 *
 * Contains Mongoose schema, enums, and LLM prompts for task tracking.
 * Extracted from taskTracker.js for modularity.
 *
 * @module services/context/taskTrackerSchema
 */

import mongoose from 'mongoose';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/ollama';

/**
 * Task status enum
 */
export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
};

/**
 * Task type enum
 */
export const TaskType = {
  INFORMATION_GATHERING: 'information_gathering',
  PROBLEM_SOLVING: 'problem_solving',
  COMPARISON: 'comparison',
  LEARNING: 'learning',
  IMPLEMENTATION: 'implementation',
  DEBUGGING: 'debugging',
  RESEARCH: 'research',
  DECISION_MAKING: 'decision_making',
};

// Task schema
const taskSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    // Task identification
    taskId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    type: {
      type: String,
      enum: Object.values(TaskType),
      default: TaskType.INFORMATION_GATHERING,
    },

    // Goal tracking
    goal: {
      statement: String,
      successCriteria: [String],
      context: String,
    },

    // Sub-tasks
    subTasks: [
      {
        id: String,
        title: String,
        status: {
          type: String,
          enum: Object.values(TaskStatus),
          default: TaskStatus.PENDING,
        },
        order: Number,
        dependencies: [String],
        completedAt: Date,
        result: String,
      },
    ],

    // Progress tracking
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.PENDING,
    },
    progress: {
      type: Number,
      default: 0,
    },
    currentSubTaskIndex: {
      type: Number,
      default: 0,
    },

    // Information gathered
    gatheredInfo: [
      {
        query: String,
        answer: String,
        timestamp: Date,
        relevant: { type: Boolean, default: true },
      },
    ],

    // Blockers and questions
    blockers: [
      {
        description: String,
        raisedAt: Date,
        resolvedAt: Date,
        resolution: String,
      },
    ],
    pendingQuestions: [String],

    // Completion
    completedAt: Date,
    completionSummary: String,
    wasSuccessful: Boolean,

    // Timestamps
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
taskSchema.index({ conversationId: 1, status: 1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ lastActivityAt: -1 });

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

// Task analysis LLM
export const taskLlm = new ChatOllama({
  model: process.env.TASK_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.2,
  numPredict: 1500,
  format: 'json',
});

// Goal extraction prompt
export const GOAL_EXTRACTION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a task analysis expert. Extract the user's goal and break it into actionable sub-tasks.

Analyze the user's query and conversation to identify:
1. The main goal they want to achieve
2. Success criteria (how we know it's done)
3. Logical sub-tasks to accomplish the goal
4. Task type

Respond with valid JSON:
{{
  "goal": {{
    "statement": "Clear statement of what user wants to achieve",
    "successCriteria": ["criterion1", "criterion2"],
    "context": "Why they need this (if apparent)"
  }},
  "taskType": "information_gathering|problem_solving|comparison|learning|implementation|debugging|research|decision_making",
  "subTasks": [
    {{"title": "First step", "order": 1, "dependencies": []}},
    {{"title": "Second step", "order": 2, "dependencies": ["1"]}}
  ],
  "isMultiTurn": true/false,
  "estimatedTurns": 1-10
}}`,
  ],
  [
    'user',
    `Conversation Context:
{conversationHistory}

Current Query: {query}

Extract the goal and sub-tasks as JSON.`,
  ],
]);

// Progress assessment prompt
export const PROGRESS_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You assess task progress based on the goal and gathered information.

Goal: {goal}
Success Criteria: {criteria}
Sub-tasks: {subTasks}

Information gathered so far:
{gatheredInfo}

Assess the progress and determine:
1. Overall progress percentage (0-100)
2. Which sub-tasks are complete
3. What's still needed
4. Any blockers identified

Respond with valid JSON:
{{
  "progress": 0-100,
  "completedSubTasks": ["subtask_id1", "subtask_id2"],
  "remainingWork": ["what still needs to be done"],
  "blockers": ["any blockers identified"],
  "isComplete": true/false,
  "completionConfidence": 0.0-1.0
}}`,
  ],
  [
    'user',
    `Latest interaction:
Query: {query}
Response: {response}

Assess the task progress as JSON.`,
  ],
]);

// Completion detection prompt
export const COMPLETION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You detect when a task has been completed.

Signals of completion:
- User thanks or acknowledges the help
- All sub-tasks are done
- Success criteria are met
- User moves to a different topic
- User explicitly says they're done

Signals of continuation:
- User asks follow-up questions on same topic
- User asks for clarification
- User requests more detail
- New related questions

Respond with valid JSON:
{{
  "isComplete": true/false,
  "confidence": 0.0-1.0,
  "reason": "Why you think the task is complete or not",
  "completionType": "success|partial|abandoned|redirected"
}}`,
  ],
  [
    'user',
    `Task Goal: {goal}
Progress: {progress}%
Sub-tasks completed: {completedCount}/{totalCount}

Recent messages:
{recentMessages}

Current query: {query}

Is this task complete?`,
  ],
]);

/**
 * Parse LLM JSON response with fallback
 */
export function parseResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }
    return {};
  }
}
