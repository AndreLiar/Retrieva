import { ragService } from '../services/rag.js';
import logger from '../config/logger.js';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ragPrompt } from '../prompts/ragPrompt.js';
import { llm } from '../config/llm.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { randomUUID } from 'crypto';

// Import from extracted modules
import {
  evaluateAnswer,
  toValidationResult,
  extractCitedSources,
} from '../services/rag/llmJudge.js';
import { rerankDocuments } from '../services/rag/documentRanking.js';
import {
  expandQuery,
  generateHypotheticalDocument,
  compressDocuments,
} from '../services/rag/retrievalEnhancements.js';
import { sanitizeDocuments, sanitizeFormattedContext } from '../utils/security/contextSanitizer.js';

// Real-time events for WebSocket streaming
import {
  emitQueryStart,
  emitQueryThinking,
  emitQueryRetrieving,
  emitQueryStream,
  emitQuerySources,
  emitQueryComplete,
  emitQueryError,
} from '../services/realtimeEvents.js';

/**
 * Stream RAG responses using Server-Sent Events
 * POST /api/v1/rag/stream
 */
export const streamRAGResponse = async (req, res) => {
  const { question, conversationId } = req.body;
  const userId = req.user?.userId?.toString();
  const queryId = randomUUID();

  if (!question) {
    return res.status(400).json({
      status: 'error',
      message: 'Question is required',
    });
  }

  // Validate required conversationId
  if (!conversationId) {
    return res.status(400).json({
      status: 'error',
      message: 'conversationId is required',
    });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Helper to send SSE event
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    logger.info('Starting streaming RAG response', {
      service: 'rag-streaming',
      conversationId,
      queryId,
      questionLength: question.length,
    });

    // Emit WebSocket: Query start
    if (userId) {
      emitQueryStart(queryId, userId, { question });
    }

    // Initialize RAG service
    if (!ragService.retriever) {
      await ragService.init();
    }

    sendEvent('status', { message: 'Retrieving context...', queryId });

    // Emit WebSocket: Thinking
    if (userId) {
      emitQueryThinking(queryId, userId, 'Analyzing your question...');
    }

    // Verify conversation exists and get history
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const messages = await Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 });

    const history = messages.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      }
      return new AIMessage(msg.content);
    });

    // Rephrase query if needed
    let searchQuery = question;
    if (history.length > 0) {
      searchQuery = await ragService.rephraseChain.invoke({
        input: question,
        chat_history: history,
      });
      sendEvent('rephrased', { query: searchQuery });
    }

    // Retrieve documents
    sendEvent('status', { message: 'Searching documents...' });

    // Emit WebSocket: Retrieving
    if (userId) {
      emitQueryRetrieving(queryId, userId, { message: 'Searching relevant documents...' });
    }

    const queryVariations = await expandQuery(searchQuery);
    const hypotheticalDoc = await generateHypotheticalDocument(searchQuery);
    const allQueries = [...queryVariations, hypotheticalDoc];

    const allRetrievedDocs = [];
    for (const qVariation of allQueries) {
      const docs = await ragService.retriever.invoke(qVariation);
      allRetrievedDocs.push(...docs);
    }

    // Deduplicate
    const uniqueDocs = [];
    const seenContent = new Set();
    for (const doc of allRetrievedDocs) {
      const contentKey = doc.pageContent.substring(0, 100);
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        uniqueDocs.push(doc);
      }
    }

    sendEvent('retrieval', {
      docsRetrieved: uniqueDocs.length,
      message: `Retrieved ${uniqueDocs.length} documents`,
    });

    // Emit WebSocket: Retrieval complete
    if (userId) {
      emitQueryRetrieving(queryId, userId, {
        message: `Found ${uniqueDocs.length} relevant documents`,
        documentsFound: uniqueDocs.length,
      });
    }

    // Re-rank
    const rerankedDocs = rerankDocuments(uniqueDocs, searchQuery, 5);
    const compressedDocs = await compressDocuments(rerankedDocs, question);

    // SECURITY FIX (GAP 10): Sanitize documents before prompt injection
    const sanitizedDocs = sanitizeDocuments(compressedDocs);

    sendEvent('status', { message: 'Generating answer...' });

    // Format context
    const rawContext = sanitizedDocs
      .map((doc, index) => {
        const docTitle = doc.metadata?.documentTitle || 'Untitled';
        const section = doc.metadata?.section || '';
        const sourceNum = index + 1;

        const header =
          section && section !== 'General'
            ? `[Source ${sourceNum}: ${docTitle} - ${section}]`
            : `[Source ${sourceNum}: ${docTitle}]`;

        return `${header}\n${doc.pageContent}`;
      })
      .join('\n\n---\n\n');

    // Apply final sanitization
    const context = sanitizeFormattedContext(rawContext);

    // Prepare sources
    const sources = sanitizedDocs.map((doc, index) => ({
      sourceNumber: index + 1,
      title: doc.metadata?.documentTitle || 'Untitled',
      url: doc.metadata?.documentUrl || doc.metadata?.source || '',
      section: doc.metadata?.section || null,
      type: doc.metadata?.documentType || 'page',
      relevanceScore: doc.rrfScore?.toFixed(4) || doc.score?.toFixed(4) || null,
    }));

    // Send sources first
    sendEvent('sources', { sources });

    // Emit WebSocket: Sources
    if (userId) {
      emitQuerySources(queryId, userId, sources);
    }

    // Stream the answer generation
    const chain = ragPrompt.pipe(llm).pipe(new StringOutputParser());

    let fullAnswer = '';
    const stream = await chain.stream({
      context,
      input: question,
      chat_history: history,
    });

    for await (const chunk of stream) {
      fullAnswer += chunk;
      sendEvent('chunk', { text: chunk });

      // Emit WebSocket: Stream token
      if (userId) {
        emitQueryStream(queryId, userId, chunk, false);
      }
    }

    // Emit WebSocket: Stream end
    if (userId) {
      emitQueryStream(queryId, userId, '', true);
    }

    sendEvent('status', { message: 'Evaluating answer with LLM Judge...' });

    // Evaluate answer using LLM as Judge
    const judgeEvaluation = await evaluateAnswer(question, fullAnswer, sources, context);
    const validation = toValidationResult(judgeEvaluation);
    const citedSources = extractCitedSources(judgeEvaluation, sources);

    sendEvent('metadata', {
      confidence: validation.confidence,
      citationCount: citedSources.length,
      citedSources: citedSources,
      qualityIssues: validation.issues,
      // Extended LLM Judge metadata
      isGrounded: validation.isGrounded,
      hasHallucinations: validation.hasHallucinations,
      isRelevant: validation.isRelevant,
      reasoning: validation.reasoning,
    });

    // Save messages to database
    await Message.create({
      conversationId,
      role: 'user',
      content: question,
    });

    await Message.create({
      conversationId,
      role: 'assistant',
      content: fullAnswer,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
    });

    sendEvent('saved', { conversationId });

    sendEvent('done', { message: 'Streaming complete' });

    // Emit WebSocket: Query complete
    if (userId) {
      emitQueryComplete(queryId, userId, {
        answer: fullAnswer,
        sources: citedSources,
        confidence: validation.confidence,
        processingTime: Date.now() - Date.now(), // Will be calculated properly
      });
    }

    logger.info('Streaming response completed', {
      service: 'rag-streaming',
      queryId,
      answerLength: fullAnswer.length,
      confidence: validation.confidence.toFixed(2),
      isGrounded: validation.isGrounded,
      hasHallucinations: validation.hasHallucinations,
    });

    res.end();
  } catch (error) {
    logger.error('Streaming error', {
      service: 'rag-streaming',
      queryId,
      error: error.message,
    });

    // Emit WebSocket: Query error
    if (userId) {
      emitQueryError(queryId, userId, error);
    }

    sendEvent('error', {
      message: error.message || 'An error occurred during streaming',
    });

    res.end();
  }
};
