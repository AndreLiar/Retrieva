import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { llm } from '../config/llm.js';
import logger from '../config/logger.js';

/**
 * Enhanced Answer Formatting Service
 * Structures RAG answers into sections, extracts key points, code examples, and suggests related topics
 */
class AnswerFormatter {
  constructor() {
    this.formattingChain = null;
    this.keyPointsChain = null;
    this.relatedTopicsChain = null;
  }

  async init() {
    // Chain to extract structure from answer
    const formattingPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `Analyze the following answer and extract its structure.
Return a JSON object with:
- summary: A one-sentence summary (max 100 chars)
- sections: Array of {heading, content} objects if the answer has multiple parts
- hasCodeExamples: boolean
- hasList: boolean

Answer to analyze:
{answer}`,
      ],
    ]);

    this.formattingChain = formattingPrompt.pipe(llm).pipe(new StringOutputParser());

    // Chain to extract key points
    const keyPointsPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `Extract 3-5 key points from the following answer.
Return ONLY a JSON array of strings, each being a concise key point (max 80 chars each).

Example: ["JWT provides stateless authentication", "Uses digital signatures for security", "Popular in modern web apps"]

Answer:
{answer}`,
      ],
    ]);

    this.keyPointsChain = keyPointsPrompt.pipe(llm).pipe(new StringOutputParser());

    // Chain to suggest related topics
    const relatedTopicsPrompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `Based on the question and answer, suggest 3-4 related topics the user might want to explore.
Return ONLY a JSON array of strings.

Example: ["OAuth 2.0 authentication", "Session-based authentication", "JWT security best practices"]

Question: {question}
Answer: {answer}`,
      ],
    ]);

    this.relatedTopicsChain = relatedTopicsPrompt.pipe(llm).pipe(new StringOutputParser());

    logger.info('Answer formatter initialized', { service: 'answer-formatter' });
  }

  /**
   * Extract code blocks from answer
   * @param {string} answer - Answer text
   * @returns {Array} Code blocks with language and content
   */
  extractCodeBlocks(answer) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(answer)) !== null) {
      blocks.push({
        language: match[1] || 'plaintext',
        code: match[2].trim(),
      });
    }

    return blocks;
  }

  /**
   * Extract bullet points/lists from answer
   * @param {string} answer - Answer text
   * @returns {Array} List items
   */
  extractListItems(answer) {
    const lines = answer.split('\n');
    const listItems = [];

    for (const line of lines) {
      // Match numbered lists (1. 2. etc.)
      const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (numberedMatch) {
        listItems.push({
          type: 'numbered',
          content: numberedMatch[1].trim(),
        });
        continue;
      }

      // Match bullet points (- * •)
      const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bulletMatch) {
        listItems.push({
          type: 'bullet',
          content: bulletMatch[1].trim(),
        });
      }
    }

    return listItems;
  }

  /**
   * Extract key points using LLM
   * @param {string} answer - Answer text
   * @returns {Promise<Array>} Key points
   */
  async extractKeyPoints(answer) {
    if (!this.keyPointsChain) {
      await this.init();
    }

    try {
      const result = await this.keyPointsChain.invoke({ answer });

      // Try to parse JSON
      const cleaned = result
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const keyPoints = JSON.parse(cleaned);

      if (Array.isArray(keyPoints) && keyPoints.length > 0) {
        logger.debug('Extracted key points', {
          service: 'answer-formatter',
          count: keyPoints.length,
        });
        return keyPoints.slice(0, 5); // Max 5 key points
      }
    } catch (error) {
      logger.warn('Failed to extract key points', {
        service: 'answer-formatter',
        error: error.message,
      });
    }

    // Fallback: extract first sentence of each paragraph
    const paragraphs = answer.split('\n\n').filter((p) => p.trim().length > 0);
    return paragraphs.slice(0, 3).map((p) => {
      const firstSentence = p.split(/[.!?]/)[0];
      return firstSentence.length > 80 ? firstSentence.substring(0, 77) + '...' : firstSentence;
    });
  }

  /**
   * Suggest related topics using LLM
   * @param {string} question - Original question
   * @param {string} answer - Answer text
   * @returns {Promise<Array>} Related topics
   */
  async suggestRelatedTopics(question, answer) {
    if (!this.relatedTopicsChain) {
      await this.init();
    }

    try {
      const result = await this.relatedTopicsChain.invoke({ question, answer });

      // Try to parse JSON
      const cleaned = result
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const topics = JSON.parse(cleaned);

      if (Array.isArray(topics) && topics.length > 0) {
        logger.debug('Suggested related topics', {
          service: 'answer-formatter',
          count: topics.length,
        });
        return topics.slice(0, 4); // Max 4 topics
      }
    } catch (error) {
      logger.warn('Failed to suggest related topics', {
        service: 'answer-formatter',
        error: error.message,
      });
    }

    return [];
  }

  /**
   * Format answer with enhanced structure
   * @param {string} answer - Raw answer text
   * @param {string} question - Original question
   * @returns {Promise<Object>} Formatted answer with structure
   */
  async format(answer, question) {
    try {
      const codeBlocks = this.extractCodeBlocks(answer);
      const listItems = this.extractListItems(answer);

      // Run key points and related topics extraction in parallel
      const [keyPoints, relatedTopics] = await Promise.all([
        this.extractKeyPoints(answer),
        this.suggestRelatedTopics(question, answer),
      ]);

      // Extract summary (first 2 sentences)
      const sentences = answer.match(/[^.!?]+[.!?]+/g) || [];
      const summary = sentences.slice(0, 2).join(' ').trim();

      const formatted = {
        text: answer,
        summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
        structure: {
          hasCodeBlocks: codeBlocks.length > 0,
          hasLists: listItems.length > 0,
          paragraphCount: answer.split('\n\n').filter((p) => p.trim()).length,
        },
        codeBlocks: codeBlocks,
        listItems: listItems.length > 0 ? listItems : undefined,
        keyPoints: keyPoints,
        relatedTopics: relatedTopics,
      };

      logger.debug('Answer formatted', {
        service: 'answer-formatter',
        hasCode: formatted.structure.hasCodeBlocks,
        hasLists: formatted.structure.hasLists,
        keyPointsCount: keyPoints.length,
        relatedTopicsCount: relatedTopics.length,
      });

      return formatted;
    } catch (error) {
      logger.error('Answer formatting failed', {
        service: 'answer-formatter',
        error: error.message,
      });

      // Return minimal formatting on error
      return {
        text: answer,
        summary: answer.substring(0, 200),
        structure: {
          hasCodeBlocks: false,
          hasLists: false,
          paragraphCount: 1,
        },
        keyPoints: [],
        relatedTopics: [],
      };
    }
  }
}

export const answerFormatter = new AnswerFormatter();
