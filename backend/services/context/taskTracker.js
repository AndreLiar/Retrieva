/**
 * Task Tracker Service
 *
 * TASK CONTEXT: Manages multi-turn task tracking
 * - Tracks ongoing tasks across conversation turns
 * - Manages goals and sub-task decomposition
 * - Detects task completion
 * - Handles task dependencies and progress
 *
 * @module services/context/taskTracker
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import logger from '../../config/logger.js';

// Import schema, enums, and prompts
import {
  TaskStatus,
  TaskType,
  Task,
  taskLlm,
  GOAL_EXTRACTION_PROMPT,
  parseResponse,
} from './taskTrackerSchema.js';

// Import progress and completion logic
import {
  updateTaskProgress,
  checkTaskCompletion,
  completeTask,
  buildTaskContext,
} from './taskProgress.js';

// Re-export for backward compatibility
export { TaskStatus, TaskType, Task };

/**
 * Task Tracker Manager
 */
class TaskTrackerManager {
  constructor() {
    this.activeTaskCache = new Map();
    this.cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Start a new task from user query
   */
  async startTask(params) {
    const { conversationId, userId, workspaceId, query, conversationHistory = [] } = params;

    const startTime = Date.now();

    try {
      // Extract goal and sub-tasks using LLM
      const historyStr = conversationHistory
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content?.substring(0, 200) || ''}`)
        .join('\n');

      const chain = GOAL_EXTRACTION_PROMPT.pipe(taskLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        conversationHistory: historyStr || 'No prior conversation',
        query,
      });

      const analysis = parseResponse(response);

      // Generate task ID
      const taskId = `task_${conversationId}_${Date.now()}`;

      // Create sub-tasks with IDs
      const subTasks = (analysis.subTasks || []).map((st, idx) => ({
        id: `subtask_${idx + 1}`,
        title: st.title,
        status: TaskStatus.PENDING,
        order: st.order || idx + 1,
        dependencies: st.dependencies || [],
      }));

      // Create task
      const task = await Task.create({
        conversationId,
        userId,
        workspaceId,
        taskId,
        title: analysis.goal?.statement?.substring(0, 100) || query.substring(0, 100),
        description: query,
        type: analysis.taskType || TaskType.INFORMATION_GATHERING,
        goal: {
          statement: analysis.goal?.statement || query,
          successCriteria: analysis.goal?.successCriteria || [],
          context: analysis.goal?.context || '',
        },
        subTasks,
        status: TaskStatus.IN_PROGRESS,
        progress: 0,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      });

      // Mark first sub-task as in progress
      if (task.subTasks.length > 0) {
        task.subTasks[0].status = TaskStatus.IN_PROGRESS;
        await task.save();
      }

      // Cache active task
      this._updateCache(conversationId, task);

      logger.info('Task started', {
        service: 'task-tracker',
        taskId,
        conversationId,
        type: task.type,
        subTaskCount: subTasks.length,
        processingTimeMs: Date.now() - startTime,
      });

      return task;
    } catch (error) {
      logger.error('Failed to start task', {
        service: 'task-tracker',
        conversationId,
        error: error.message,
      });

      // Create minimal task
      const taskId = `task_${conversationId}_${Date.now()}`;
      return Task.create({
        conversationId,
        userId,
        workspaceId,
        taskId,
        title: query.substring(0, 100),
        description: query,
        type: TaskType.INFORMATION_GATHERING,
        goal: { statement: query },
        status: TaskStatus.IN_PROGRESS,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      });
    }
  }

  /**
   * Get active task for conversation
   */
  async getActiveTask(conversationId) {
    // Check cache
    const cached = this.activeTaskCache.get(conversationId);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.task;
    }

    // Find active task
    const task = await Task.findOne({
      conversationId,
      status: { $in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
    }).sort({ lastActivityAt: -1 });

    if (task) {
      this._updateCache(conversationId, task);
    }

    return task;
  }

  /**
   * Update task progress with new interaction
   */
  async updateProgress(conversationId, interaction) {
    const task = await this.getActiveTask(conversationId);
    if (!task) {
      return { hasActiveTask: false };
    }

    return updateTaskProgress(task, interaction, this._updateCache.bind(this));
  }

  /**
   * Check if task is complete
   */
  async checkCompletion(conversationId, interaction) {
    const task = await this.getActiveTask(conversationId);
    if (!task) {
      return { hasActiveTask: false };
    }

    return checkTaskCompletion(task, interaction);
  }

  /**
   * Get task context for prompts
   */
  async getTaskContext(conversationId) {
    const task = await this.getActiveTask(conversationId);

    if (!task) {
      return {
        hasActiveTask: false,
        context: '',
      };
    }

    return buildTaskContext(task);
  }

  /**
   * Decompose a complex query into sub-tasks
   */
  async decomposeQuery(query, context = {}) {
    try {
      const chain = GOAL_EXTRACTION_PROMPT.pipe(taskLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        conversationHistory: context.conversationHistory || 'No prior conversation',
        query,
      });

      const analysis = parseResponse(response);

      return {
        goal: analysis.goal,
        subTasks: analysis.subTasks || [],
        taskType: analysis.taskType,
        isMultiTurn: analysis.isMultiTurn || false,
        estimatedTurns: analysis.estimatedTurns || 1,
      };
    } catch (error) {
      logger.error('Query decomposition failed', {
        service: 'task-tracker',
        error: error.message,
      });

      return {
        goal: { statement: query },
        subTasks: [],
        taskType: TaskType.INFORMATION_GATHERING,
        isMultiTurn: false,
        estimatedTurns: 1,
      };
    }
  }

  /**
   * Get task statistics
   */
  async getStats(userId) {
    const [total, completed, inProgress, byType] = await Promise.all([
      Task.countDocuments({ userId }),
      Task.countDocuments({ userId, status: TaskStatus.COMPLETED }),
      Task.countDocuments({ userId, status: TaskStatus.IN_PROGRESS }),
      Task.aggregate([{ $match: { userId } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    ]);

    const successRate =
      completed > 0
        ? (await Task.countDocuments({
            userId,
            status: TaskStatus.COMPLETED,
            wasSuccessful: true,
          })) / completed
        : 0;

    return {
      total,
      completed,
      inProgress,
      successRate,
      byType: byType.map((t) => ({ type: t._id, count: t.count })),
    };
  }

  /**
   * Update cache
   * @private
   */
  _updateCache(conversationId, task) {
    this.activeTaskCache.set(conversationId, {
      task,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(conversationId = null) {
    if (conversationId) {
      this.activeTaskCache.delete(conversationId);
    } else {
      this.activeTaskCache.clear();
    }
  }
}

// Singleton
export const taskTracker = new TaskTrackerManager();
export { TaskTrackerManager };
