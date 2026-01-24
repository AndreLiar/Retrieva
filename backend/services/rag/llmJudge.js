/**
 * LLM as Judge Service
 *
 * Evaluates RAG answer quality using an LLM (mistral) for:
 * - Hallucination detection (is answer grounded in sources?)
 * - Relevance scoring (does answer address the question?)
 * - Completeness assessment (is answer comprehensive?)
 * - Citation verification (are sources correctly referenced?)
 *
 * @module services/rag/llmJudge
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { judgeLlm } from '../../config/llm.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} JudgeEvaluation
 * @property {boolean} isGrounded - Whether answer is grounded in sources
 * @property {boolean} isRelevant - Whether answer addresses the question
 * @property {boolean} isComplete - Whether answer is comprehensive
 * @property {number} confidence - Overall confidence score (0-1)
 * @property {boolean} hasHallucinations - Whether hallucinations were detected
 * @property {string[]} issues - List of quality issues found
 * @property {string} reasoning - Judge's reasoning explanation
 * @property {number[]} citedSourceNumbers - Source numbers actually used
 */

/**
 * @typedef {Object} Source
 * @property {number} sourceNumber - Source index
 * @property {string} title - Document title
 * @property {string} [section] - Section within document
 */

// Judge evaluation prompt
const JUDGE_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert evaluator for a RAG (Retrieval-Augmented Generation) system.
Your job is to evaluate the quality of an answer given a question and the source documents used.

Evaluate the following criteria:
1. GROUNDING: Is the answer fully supported by the provided sources? Any claims not in sources = hallucination.
2. RELEVANCE: Does the answer directly address the user's question?
3. COMPLETENESS: Does the answer cover the key aspects of the question using available information?
4. CITATIONS: Are source references ([Source N]) used correctly and accurately?

Be strict about hallucinations - if any claim cannot be traced to the sources, mark hasHallucinations as true.

Respond ONLY with valid JSON in this exact format:
{{
  "isGrounded": boolean,
  "isRelevant": boolean,
  "isComplete": boolean,
  "confidence": number between 0 and 1,
  "hasHallucinations": boolean,
  "issues": ["list of specific issues found"],
  "reasoning": "brief explanation of your evaluation",
  "citedSourceNumbers": [list of source numbers actually referenced in answer]
}}`,
  ],
  [
    'user',
    `QUESTION: {question}

SOURCES PROVIDED:
{sources}

ANSWER TO EVALUATE:
{answer}

Evaluate this answer and respond with JSON only.`,
  ],
]);

/**
 * Format sources for the judge prompt
 * @param {Source[]} sources - Array of source objects
 * @param {string} context - The context string with source content
 * @returns {string} Formatted sources string
 */
function formatSourcesForJudge(sources, context) {
  return sources
    .map((source, index) => {
      return `[Source ${source.sourceNumber || index + 1}]: ${source.title}${source.section ? ` - ${source.section}` : ''}`;
    })
    .join('\n');
}

/**
 * Parse JSON response from judge, handling potential formatting issues
 * @param {string} response - Raw response from judge LLM
 * @returns {Object} Parsed evaluation object
 */
function parseJudgeResponse(response) {
  try {
    // Try direct parse first
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from response if wrapped in markdown or other text
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn('Failed to parse extracted JSON from judge response', {
          service: 'llm-judge',
          response: response.substring(0, 200),
        });
      }
    }

    // Return default failure evaluation
    return {
      isGrounded: false,
      isRelevant: false,
      isComplete: false,
      confidence: 0,
      hasHallucinations: true,
      issues: ['Failed to parse judge evaluation'],
      reasoning: 'Judge response parsing failed',
      citedSourceNumbers: [],
    };
  }
}

/**
 * Validate and normalize judge evaluation
 * @param {Object} evaluation - Raw evaluation from judge
 * @returns {JudgeEvaluation} Normalized evaluation
 */
function normalizeEvaluation(evaluation) {
  return {
    isGrounded: Boolean(evaluation.isGrounded),
    isRelevant: Boolean(evaluation.isRelevant),
    isComplete: Boolean(evaluation.isComplete),
    confidence: Math.max(0, Math.min(1, Number(evaluation.confidence) || 0)),
    hasHallucinations: Boolean(evaluation.hasHallucinations),
    issues: Array.isArray(evaluation.issues) ? evaluation.issues : [],
    reasoning: String(evaluation.reasoning || ''),
    citedSourceNumbers: Array.isArray(evaluation.citedSourceNumbers)
      ? evaluation.citedSourceNumbers.filter((n) => typeof n === 'number')
      : [],
  };
}

/**
 * Evaluate answer quality using LLM as Judge
 *
 * @param {string} question - The user's original question
 * @param {string} answer - The generated answer to evaluate
 * @param {Source[]} sources - The sources used for generation
 * @param {string} [context=''] - The formatted context string
 * @returns {Promise<JudgeEvaluation>} Evaluation results
 */
export async function evaluateAnswer(question, answer, sources, context = '') {
  const startTime = Date.now();

  try {
    logger.info('Starting LLM Judge evaluation', {
      service: 'llm-judge',
      questionLength: question.length,
      answerLength: answer.length,
      sourcesCount: sources.length,
    });

    const chain = JUDGE_PROMPT.pipe(judgeLlm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      question,
      answer,
      sources: formatSourcesForJudge(sources, context),
    });

    const rawEvaluation = parseJudgeResponse(response);
    const evaluation = normalizeEvaluation(rawEvaluation);

    logger.info('LLM Judge evaluation complete', {
      service: 'llm-judge',
      confidence: evaluation.confidence.toFixed(2),
      isGrounded: evaluation.isGrounded,
      hasHallucinations: evaluation.hasHallucinations,
      issuesCount: evaluation.issues.length,
      latencyMs: Date.now() - startTime,
    });

    return evaluation;
  } catch (error) {
    logger.error('LLM Judge evaluation failed', {
      service: 'llm-judge',
      error: error.message,
      latencyMs: Date.now() - startTime,
    });

    // Return conservative failure evaluation
    return {
      isGrounded: false,
      isRelevant: true, // Assume relevant to avoid unnecessary retries
      isComplete: false,
      confidence: 0.3,
      hasHallucinations: false, // Can't determine without evaluation
      issues: [`Judge evaluation failed: ${error.message}`],
      reasoning: 'Evaluation could not be completed due to error',
      citedSourceNumbers: [],
    };
  }
}

/**
 * Quick check if answer quality warrants a retry
 * Used to decide whether to fetch more context and regenerate
 *
 * @param {JudgeEvaluation} evaluation - The judge's evaluation
 * @param {number} [minConfidence=0.4] - Minimum confidence threshold
 * @returns {boolean} True if answer quality is too low
 */
export function shouldRetry(evaluation, minConfidence = 0.4) {
  // Retry if:
  // 1. Confidence is below threshold
  // 2. Hallucinations detected
  // 3. Answer is not grounded in sources
  return (
    evaluation.confidence < minConfidence || evaluation.hasHallucinations || !evaluation.isGrounded
  );
}

/**
 * Extract cited sources from evaluation
 * Maps source numbers to actual source objects
 *
 * @param {JudgeEvaluation} evaluation - The judge's evaluation
 * @param {Source[]} sources - All available sources
 * @returns {Source[]} Sources that were actually cited
 */
export function extractCitedSources(evaluation, sources) {
  if (!evaluation.citedSourceNumbers || evaluation.citedSourceNumbers.length === 0) {
    // Fallback: return all sources if judge didn't identify specific ones
    return sources;
  }

  return evaluation.citedSourceNumbers
    .map((num) => sources.find((s) => s.sourceNumber === num))
    .filter(Boolean);
}

/**
 * Convert judge evaluation to validation result format
 * For compatibility with existing code that expects ValidationResult
 *
 * @param {JudgeEvaluation} evaluation - Judge evaluation
 * @returns {Object} Validation result in legacy format
 */
export function toValidationResult(evaluation) {
  return {
    isLowQuality: shouldRetry(evaluation),
    confidence: evaluation.confidence,
    issues: evaluation.issues,
    citationCount: evaluation.citedSourceNumbers.length,
    validCitationCount: evaluation.citedSourceNumbers.length,
    meetsMinConfidence: evaluation.confidence >= 0.4,
    // Extended fields from LLM Judge
    isGrounded: evaluation.isGrounded,
    isRelevant: evaluation.isRelevant,
    isComplete: evaluation.isComplete,
    hasHallucinations: evaluation.hasHallucinations,
    reasoning: evaluation.reasoning,
  };
}
