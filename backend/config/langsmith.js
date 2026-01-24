/**
 * LangSmith Configuration
 *
 * LangSmith provides:
 * - Tracing of all LLM calls
 * - Latency breakdown by component
 * - Token usage tracking
 * - Prompt versioning and debugging
 * - Production monitoring dashboard
 *
 * Setup:
 * 1. Create account at https://smith.langchain.com
 * 2. Get API key from Settings
 * 3. Add to .env: LANGSMITH_API_KEY=your_key
 */

import { Client } from 'langsmith';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import logger from './logger.js';

// Environment configuration
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || 'rag-notion';
const LANGSMITH_ENDPOINT = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
const LANGSMITH_ENABLED = process.env.LANGSMITH_ENABLED !== 'false' && !!LANGSMITH_API_KEY;

/**
 * LangSmith client for direct API access
 */
let langsmithClient = null;

if (LANGSMITH_ENABLED) {
  try {
    langsmithClient = new Client({
      apiKey: LANGSMITH_API_KEY,
      apiUrl: LANGSMITH_ENDPOINT,
    });
    logger.info('LangSmith client initialized', {
      service: 'langsmith',
      project: LANGSMITH_PROJECT,
    });
  } catch (error) {
    logger.warn('Failed to initialize LangSmith client', {
      service: 'langsmith',
      error: error.message,
    });
  }
}

/**
 * Create a LangChain tracer for a specific run
 * @param {Object} options - Tracer options
 * @param {string} options.runName - Name for this run (e.g., "rag-query")
 * @param {Object} options.metadata - Additional metadata to attach
 * @param {string} options.userId - User ID for filtering
 * @param {string} options.sessionId - Session/conversation ID
 * @returns {LangChainTracer|null}
 */
function createTracer(options = {}) {
  if (!LANGSMITH_ENABLED) {
    return null;
  }

  const { runName = 'rag-query', metadata = {}, userId = null, sessionId = null } = options;

  try {
    const tracer = new LangChainTracer({
      projectName: LANGSMITH_PROJECT,
      client: langsmithClient,
    });

    // Store metadata for the run
    tracer.runName = runName;
    tracer.metadata = {
      ...metadata,
      userId,
      sessionId,
      environment: process.env.NODE_ENV || 'development',
    };

    return tracer;
  } catch (error) {
    logger.warn('Failed to create LangSmith tracer', {
      service: 'langsmith',
      error: error.message,
    });
    return null;
  }
}

/**
 * Get callbacks array for LangChain operations
 * Includes LangSmith tracer if enabled
 * @param {Object} options - Options for tracer
 * @returns {Array}
 */
function getCallbacks(options = {}) {
  const callbacks = [];

  const tracer = createTracer(options);
  if (tracer) {
    callbacks.push(tracer);
  }

  return callbacks;
}

/**
 * Log feedback for a run (user rating, corrections, etc.)
 * @param {string} runId - The run ID from LangSmith
 * @param {Object} feedback - Feedback data
 * @param {number} feedback.score - Score (0-1)
 * @param {string} feedback.comment - Optional comment
 * @param {string} feedback.key - Feedback type (e.g., "user-rating", "correctness")
 */
async function logFeedback(runId, feedback) {
  if (!LANGSMITH_ENABLED || !langsmithClient) {
    return null;
  }

  try {
    await langsmithClient.createFeedback(runId, feedback.key || 'user-rating', {
      score: feedback.score,
      comment: feedback.comment,
    });

    logger.debug('Logged feedback to LangSmith', {
      service: 'langsmith',
      runId,
      feedbackKey: feedback.key,
    });

    return true;
  } catch (error) {
    logger.warn('Failed to log feedback to LangSmith', {
      service: 'langsmith',
      runId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Create a dataset for evaluation
 * @param {string} name - Dataset name
 * @param {string} description - Dataset description
 * @returns {Promise<Object>}
 */
async function createDataset(name, description = '') {
  if (!LANGSMITH_ENABLED || !langsmithClient) {
    throw new Error('LangSmith is not enabled');
  }

  return langsmithClient.createDataset(name, { description });
}

/**
 * Add examples to a dataset
 * @param {string} datasetId - Dataset ID
 * @param {Array} examples - Array of { input, output } objects
 */
async function addExamplesToDataset(datasetId, examples) {
  if (!LANGSMITH_ENABLED || !langsmithClient) {
    throw new Error('LangSmith is not enabled');
  }

  for (const example of examples) {
    await langsmithClient.createExample(example.input, example.output, { datasetId });
  }
}

/**
 * Get run URL for debugging
 * @param {string} runId - Run ID
 * @returns {string}
 */
function getRunUrl(runId) {
  return `https://smith.langchain.com/o/${LANGSMITH_PROJECT}/runs/${runId}`;
}

/**
 * Check if LangSmith is properly configured
 * @returns {Object} Status info
 */
function getStatus() {
  return {
    enabled: LANGSMITH_ENABLED,
    project: LANGSMITH_PROJECT,
    hasClient: !!langsmithClient,
    endpoint: LANGSMITH_ENDPOINT,
  };
}

export {
  langsmithClient,
  createTracer,
  getCallbacks,
  logFeedback,
  createDataset,
  addExamplesToDataset,
  getRunUrl,
  getStatus,
  LANGSMITH_ENABLED,
  LANGSMITH_PROJECT,
};
