/**
 * Document Summarization Service
 *
 * M3 COMPRESSED MEMORY: Creates condensed summaries of documents
 * - Generates concise summaries preserving key information
 * - Extracts key points and topics
 * - Enables faster context building
 *
 * @module services/memory/summarization
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { DocumentSummary } from '../../models/DocumentSummary.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} SummaryResult
 * @property {string} summary - Condensed summary
 * @property {string[]} keyPoints - Key points extracted
 * @property {string[]} topics - Topics identified
 * @property {number} compressionRatio - Original to summary ratio
 */

// Summarization LLM (using mistral for quality)
const summarizationLlm = new ChatOllama({
  model: process.env.SUMMARIZATION_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.3,
  numPredict: 1000,
});

// Summarization prompt
const SUMMARIZATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert document summarizer. Your task is to create a concise, informative summary of the provided document.

Guidelines:
- Create a summary that captures the main ideas and key information
- Keep the summary between 100-300 words
- Preserve important facts, numbers, and names
- Use clear, professional language
- Focus on what's most useful for someone searching for this information

Respond in this exact JSON format:
{{
  "summary": "A comprehensive summary of the document...",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "topics": ["topic1", "topic2", "topic3"]
}}`,
  ],
  [
    'user',
    `Document Title: {title}

Document Content:
{content}

Generate a structured summary in JSON format.`,
  ],
]);

/**
 * Parse JSON response from LLM, handling potential formatting issues
 * @param {string} response - Raw LLM response
 * @returns {Object} Parsed summary object
 */
function parseSummaryResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn('Failed to parse extracted JSON from summary response', {
          service: 'summarization',
          response: response.substring(0, 200),
        });
      }
    }

    // Return basic structure with response as summary
    return {
      summary: response.trim(),
      keyPoints: [],
      topics: [],
    };
  }
}

/**
 * Summarize a document
 *
 * @param {string} content - Document content to summarize
 * @param {string} title - Document title
 * @param {Object} options - Summarization options
 * @returns {Promise<SummaryResult>} Summary result
 */
export async function summarizeDocument(content, title, options = {}) {
  const startTime = Date.now();
  const { maxContentLength = 15000 } = options;

  try {
    // Truncate if too long (keep first portion for summary)
    const truncatedContent =
      content.length > maxContentLength
        ? content.substring(0, maxContentLength) + '\n\n[Content truncated for summarization...]'
        : content;

    logger.info('Starting document summarization', {
      service: 'summarization',
      title,
      originalLength: content.length,
      truncatedLength: truncatedContent.length,
    });

    const chain = SUMMARIZATION_PROMPT.pipe(summarizationLlm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      title,
      content: truncatedContent,
    });

    const parsed = parseSummaryResponse(response);

    const result = {
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 10) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 10) : [],
      compressionRatio: parsed.summary ? 1 - parsed.summary.length / content.length : 0,
      originalLength: content.length,
      processingTimeMs: Date.now() - startTime,
    };

    logger.info('Document summarization complete', {
      service: 'summarization',
      title,
      summaryLength: result.summary.length,
      keyPointsCount: result.keyPoints.length,
      topicsCount: result.topics.length,
      compressionRatio: result.compressionRatio.toFixed(2),
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  } catch (error) {
    logger.error('Document summarization failed', {
      service: 'summarization',
      title,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });

    throw error;
  }
}

/**
 * Create or update document summary in database
 *
 * @param {Object} params - Summary parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.documentSourceId - DocumentSource ID
 * @param {string} params.sourceId - Source document ID
 * @param {string} params.title - Document title
 * @param {string} params.content - Document content
 * @returns {Promise<DocumentSummary>} Created/updated summary
 */
export async function createOrUpdateSummary({
  workspaceId,
  documentSourceId,
  sourceId,
  title,
  content,
}) {
  const startTime = Date.now();

  try {
    // Generate summary
    const summaryResult = await summarizeDocument(content, title);

    // Find existing or create new
    let docSummary = await DocumentSummary.findOne({ workspaceId, sourceId });

    if (docSummary) {
      // Update existing
      docSummary.summary = summaryResult.summary;
      docSummary.summaryLength = summaryResult.summary.length;
      docSummary.keyPoints = summaryResult.keyPoints;
      docSummary.topics = summaryResult.topics;
      docSummary.originalLength = summaryResult.originalLength;
      docSummary.compressionRatio = summaryResult.compressionRatio;
      docSummary.processingTimeMs = summaryResult.processingTimeMs;
      docSummary.version += 1;
      await docSummary.save();

      logger.info('Updated document summary', {
        service: 'summarization',
        sourceId,
        version: docSummary.version,
      });
    } else {
      // Create new
      docSummary = await DocumentSummary.create({
        workspaceId,
        documentSourceId,
        sourceId,
        title,
        summary: summaryResult.summary,
        summaryLength: summaryResult.summary.length,
        keyPoints: summaryResult.keyPoints,
        topics: summaryResult.topics,
        originalLength: summaryResult.originalLength,
        compressionRatio: summaryResult.compressionRatio,
        processingTimeMs: summaryResult.processingTimeMs,
      });

      logger.info('Created document summary', {
        service: 'summarization',
        sourceId,
        summaryId: docSummary._id,
      });
    }

    return docSummary;
  } catch (error) {
    logger.error('Failed to create/update document summary', {
      service: 'summarization',
      sourceId,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });

    throw error;
  }
}

/**
 * Get relevant summaries for a query
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string[]} topics - Topics to match
 * @param {Object} options - Query options
 * @returns {Promise<DocumentSummary[]>} Matching summaries
 */
export async function getRelevantSummaries(workspaceId, topics, options = {}) {
  const { limit = 5 } = options;

  if (!topics || topics.length === 0) {
    return [];
  }

  // Find summaries that match any of the topics
  const summaries = await DocumentSummary.find({
    workspaceId,
    topics: { $in: topics.map((t) => new RegExp(t, 'i')) },
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('title summary keyPoints topics');

  return summaries;
}

/**
 * Get all topics for a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<string[]>} Unique topics
 */
export async function getWorkspaceTopics(workspaceId) {
  const summaries = await DocumentSummary.find({ workspaceId }).select('topics');

  const topicSet = new Set();
  summaries.forEach((s) => {
    s.topics.forEach((t) => topicSet.add(t.toLowerCase()));
  });

  return Array.from(topicSet).sort();
}

/**
 * Build summary context for RAG
 * Formats summaries into context string for LLM
 *
 * @param {DocumentSummary[]} summaries - Summaries to format
 * @returns {string} Formatted context string
 */
export function buildSummaryContext(summaries) {
  if (!summaries || summaries.length === 0) {
    return '';
  }

  return summaries
    .map((s, index) => {
      const keyPointsStr =
        s.keyPoints.length > 0
          ? `\nKey Points:\n${s.keyPoints.map((kp) => `  - ${kp}`).join('\n')}`
          : '';

      return `[Document Overview ${index + 1}: ${s.title}]
${s.summary}${keyPointsStr}`;
    })
    .join('\n\n---\n\n');
}
