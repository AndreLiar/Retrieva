/**
 * Task Progress Module
 *
 * Handles task progress updates and completion detection.
 * Extracted from taskTracker.js for modularity.
 *
 * @module services/context/taskProgress
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  TaskStatus,
  Task,
  taskLlm,
  PROGRESS_PROMPT,
  COMPLETION_PROMPT,
  parseResponse,
} from './taskTrackerSchema.js';
import logger from '../../config/logger.js';

/**
 * Update task progress with new interaction
 *
 * @param {Object} task - Task document
 * @param {Object} interaction - Interaction details
 * @param {Function} cacheUpdate - Function to update cache
 * @returns {Promise<Object>}
 */
export async function updateTaskProgress(task, interaction, cacheUpdate) {
  const { query, response } = interaction;
  const startTime = Date.now();

  try {
    // Record gathered info
    task.gatheredInfo.push({
      query,
      answer: response.substring(0, 500),
      timestamp: new Date(),
      relevant: true,
    });

    // Keep only last 20 gathered info items
    if (task.gatheredInfo.length > 20) {
      task.gatheredInfo = task.gatheredInfo.slice(-20);
    }

    // Assess progress using LLM
    const gatheredInfoStr = task.gatheredInfo
      .map((g) => `Q: ${g.query}\nA: ${g.answer}`)
      .join('\n\n');

    const chain = PROGRESS_PROMPT.pipe(taskLlm).pipe(new StringOutputParser());

    const progressResponse = await chain.invoke({
      goal: task.goal.statement,
      criteria: task.goal.successCriteria.join(', ') || 'Not specified',
      subTasks: task.subTasks.map((st) => `${st.id}: ${st.title} (${st.status})`).join(', '),
      gatheredInfo: gatheredInfoStr,
      query,
      response: response.substring(0, 300),
    });

    const progressAnalysis = parseResponse(progressResponse);

    // Update task progress
    task.progress = Math.min(100, Math.max(0, progressAnalysis.progress || task.progress));

    // Update sub-task statuses
    const completedIds = progressAnalysis.completedSubTasks || [];
    for (const subTask of task.subTasks) {
      if (completedIds.includes(subTask.id) && subTask.status !== TaskStatus.COMPLETED) {
        subTask.status = TaskStatus.COMPLETED;
        subTask.completedAt = new Date();
      }
    }

    // Find next sub-task to work on
    const nextPending = task.subTasks.find((st) => st.status === TaskStatus.PENDING);
    if (nextPending) {
      nextPending.status = TaskStatus.IN_PROGRESS;
      task.currentSubTaskIndex = task.subTasks.indexOf(nextPending);
    }

    // Record blockers
    if (progressAnalysis.blockers?.length > 0) {
      for (const blocker of progressAnalysis.blockers) {
        if (!task.blockers.find((b) => b.description === blocker)) {
          task.blockers.push({
            description: blocker,
            raisedAt: new Date(),
          });
        }
      }
    }

    // Check for completion
    if (progressAnalysis.isComplete && progressAnalysis.completionConfidence >= 0.7) {
      await completeTask(task, true, 'All goals achieved');
    }

    task.lastActivityAt = new Date();
    await task.save();

    // Update cache
    if (cacheUpdate) {
      cacheUpdate(task.conversationId, task);
    }

    logger.debug('Task progress updated', {
      service: 'task-tracker',
      taskId: task.taskId,
      progress: task.progress,
      completedSubTasks: task.subTasks.filter((st) => st.status === TaskStatus.COMPLETED).length,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      hasActiveTask: true,
      taskId: task.taskId,
      progress: task.progress,
      status: task.status,
      currentSubTask: task.subTasks[task.currentSubTaskIndex]?.title,
      remainingSubTasks: task.subTasks.filter((st) => st.status !== TaskStatus.COMPLETED).length,
    };
  } catch (error) {
    logger.error('Failed to update task progress', {
      service: 'task-tracker',
      taskId: task.taskId,
      error: error.message,
    });

    // Simple fallback update
    task.lastActivityAt = new Date();
    await task.save();

    return {
      hasActiveTask: true,
      taskId: task.taskId,
      progress: task.progress,
      status: task.status,
    };
  }
}

/**
 * Check if task is complete
 *
 * @param {Object} task - Task document
 * @param {Object} interaction - Latest interaction
 * @returns {Promise<Object>}
 */
export async function checkTaskCompletion(task, interaction) {
  const { query, recentMessages = [] } = interaction;

  try {
    // Quick check - if progress is 100%, likely complete
    if (task.progress >= 100) {
      await completeTask(task, true, 'All sub-tasks completed');
      return {
        isComplete: true,
        completionType: 'success',
        confidence: 0.95,
      };
    }

    // Quick pattern matching for completion signals
    const queryLower = query.toLowerCase();
    const completionPatterns =
      /\b(thank|thanks|got it|perfect|that'?s (all|it|great|helpful)|done|finished|understood|clear now)\b/i;
    const continuationPatterns =
      /\b(but|also|what about|how about|can you|could you|tell me more|explain|why|another)\b/i;

    if (completionPatterns.test(queryLower) && !continuationPatterns.test(queryLower)) {
      // Likely completion - use LLM to confirm
      const recentMsgStr = recentMessages
        .slice(-4)
        .map((m) => `${m.role.toUpperCase()}: ${m.content?.substring(0, 150) || ''}`)
        .join('\n');

      const chain = COMPLETION_PROMPT.pipe(taskLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        goal: task.goal.statement,
        progress: task.progress,
        completedCount: task.subTasks.filter((st) => st.status === TaskStatus.COMPLETED).length,
        totalCount: task.subTasks.length,
        recentMessages: recentMsgStr,
        query,
      });

      const analysis = parseResponse(response);

      if (analysis.isComplete && analysis.confidence >= 0.7) {
        await completeTask(task, analysis.completionType === 'success', analysis.reason);

        return {
          isComplete: true,
          completionType: analysis.completionType,
          confidence: analysis.confidence,
          reason: analysis.reason,
        };
      }
    }

    return {
      isComplete: false,
      progress: task.progress,
      remainingWork: task.subTasks
        .filter((st) => st.status !== TaskStatus.COMPLETED)
        .map((st) => st.title),
    };
  } catch (error) {
    logger.error('Completion check failed', {
      service: 'task-tracker',
      taskId: task.taskId,
      error: error.message,
    });

    return {
      isComplete: false,
      progress: task.progress,
    };
  }
}

/**
 * Complete a task
 *
 * @param {Object} task - Task document
 * @param {boolean} wasSuccessful - Whether task was successful
 * @param {string} summary - Completion summary
 * @param {Function} cacheDelete - Function to delete from cache
 */
export async function completeTask(task, wasSuccessful, summary, cacheDelete = null) {
  task.status = TaskStatus.COMPLETED;
  task.completedAt = new Date();
  task.wasSuccessful = wasSuccessful;
  task.completionSummary = summary;
  task.progress = 100;

  // Mark remaining sub-tasks
  for (const subTask of task.subTasks) {
    if (subTask.status !== TaskStatus.COMPLETED) {
      subTask.status = wasSuccessful ? TaskStatus.COMPLETED : TaskStatus.ABANDONED;
    }
  }

  await task.save();

  // Remove from cache
  if (cacheDelete) {
    cacheDelete(task.conversationId);
  }

  logger.info('Task completed', {
    service: 'task-tracker',
    taskId: task.taskId,
    wasSuccessful,
    duration: Date.now() - new Date(task.startedAt).getTime(),
  });
}

/**
 * Get task context for prompts
 *
 * @param {Object} task - Task document
 * @returns {Object}
 */
export function buildTaskContext(task) {
  const completedSubTasks = task.subTasks.filter((st) => st.status === TaskStatus.COMPLETED);
  const currentSubTask = task.subTasks[task.currentSubTaskIndex];
  const remainingSubTasks = task.subTasks.filter(
    (st) => st.status !== TaskStatus.COMPLETED && st.id !== currentSubTask?.id
  );

  const contextParts = [];
  contextParts.push(`[Current Task: ${task.goal.statement}]`);
  contextParts.push(`Progress: ${task.progress}%`);

  if (currentSubTask) {
    contextParts.push(`Currently working on: ${currentSubTask.title}`);
  }

  if (completedSubTasks.length > 0) {
    contextParts.push(`Completed: ${completedSubTasks.map((st) => st.title).join(', ')}`);
  }

  if (remainingSubTasks.length > 0) {
    contextParts.push(`Remaining: ${remainingSubTasks.map((st) => st.title).join(', ')}`);
  }

  return {
    hasActiveTask: true,
    taskId: task.taskId,
    goal: task.goal.statement,
    type: task.type,
    progress: task.progress,
    currentSubTask: currentSubTask?.title,
    completedSubTasks: completedSubTasks.map((st) => st.title),
    remainingSubTasks: remainingSubTasks.map((st) => st.title),
    gatheredInfoCount: task.gatheredInfo.length,
    blockers: task.blockers.filter((b) => !b.resolvedAt).map((b) => b.description),
    context: contextParts.join('\n'),
  };
}
