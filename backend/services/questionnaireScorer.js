/**
 * Questionnaire Scorer Service
 *
 * Uses gpt-4o-mini (via createLLM) to score each vendor answer independently
 * in parallel, then generates an executive summary across all Q&A pairs.
 */

import { createLLM } from '../config/llmProvider.js';
import { VendorQuestionnaire } from '../models/VendorQuestionnaire.js';
import logger from '../config/logger.js';

const SYSTEM_PROMPT = `You are a DORA (Digital Operational Resilience Act) compliance expert assessing vendor questionnaire responses on behalf of a financial entity. Your role is to score each vendor answer objectively and identify compliance gaps.`;

/**
 * Score a single question answer via LLM.
 * Returns { score, gapLevel, reasoning } or falls back to heuristic on error.
 */
async function scoreQuestion(llm, { doraArticle, questionText, answer }) {
  const userPrompt = `Article: ${doraArticle}
Obligation: ${questionText}
Vendor answer: ${answer}

Respond ONLY with valid JSON (no markdown, no explanation):
{"score":<integer 0-100>,"gapLevel":"covered|partial|missing","reasoning":"<1-2 sentences>"}

Scoring guide:
- covered (80-100): fully addresses the obligation with specific evidence, processes, or commitments
- partial (30-79): vague, incomplete, or missing key elements required by the article
- missing (0-29): no meaningful answer or answer does not address the obligation at all`;

  try {
    const response = await llm.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    const text = (response.content || '').trim();

    // Extract JSON — handle cases where LLM wraps in markdown fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const gapLevel = ['covered', 'partial', 'missing'].includes(parsed.gapLevel)
      ? parsed.gapLevel
      : score >= 80
        ? 'covered'
        : score >= 30
          ? 'partial'
          : 'missing';

    return { score, gapLevel, reasoning: parsed.reasoning || '' };
  } catch (err) {
    logger.warn('LLM scoring failed for question, using heuristic fallback', {
      service: 'questionnaire-scorer',
      doraArticle,
      error: err.message,
    });
    // Heuristic fallback based on answer length
    if (answer && answer.length > 200) {
      return {
        score: 50,
        gapLevel: 'partial',
        reasoning: 'Answer provided but could not be automatically scored.',
      };
    }
    return { score: 10, gapLevel: 'missing', reasoning: 'Insufficient answer provided.' };
  }
}

/**
 * Generate an executive summary across all scored Q&A pairs.
 */
async function generateSummary(llm, questionnaire) {
  const answeredQuestions = questionnaire.questions.filter((q) => q.answer && q.answer.trim());
  if (answeredQuestions.length === 0) return '';

  const qaContext = answeredQuestions
    .map(
      (q) =>
        `[${q.doraArticle}] ${q.text}\nAnswer: ${q.answer}\nScore: ${q.score}/100 (${q.gapLevel})`
    )
    .join('\n\n');

  const userPrompt = `Vendor: ${questionnaire.vendorName}
Overall Score: ${questionnaire.overallScore}/100

Questionnaire Responses (${answeredQuestions.length} questions):
${qaContext}

Write a 3-5 sentence executive summary of this vendor's DORA compliance posture. Highlight the strongest areas, the most critical gaps, and the primary recommendations for the financial entity's risk team. Be specific and reference relevant DORA articles.`;

  try {
    const response = await llm.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);
    return (response.content || '').trim();
  } catch (err) {
    logger.warn('LLM summary generation failed', {
      service: 'questionnaire-scorer',
      questionnaireId: questionnaire._id,
      error: err.message,
    });
    return `Assessment completed for ${questionnaire.vendorName}. Overall score: ${questionnaire.overallScore}/100. Manual review recommended.`;
  }
}

/**
 * Main scoring entry point — called by the BullMQ worker.
 *
 * @param {string} questionnaireId - MongoDB _id of VendorQuestionnaire
 * @param {object} [job] - BullMQ job (optional, for progress updates)
 */
export async function runScoring(questionnaireId, job) {
  const questionnaire = await VendorQuestionnaire.findById(questionnaireId);

  if (!questionnaire) {
    throw new Error(`VendorQuestionnaire not found: ${questionnaireId}`);
  }

  const answeredQuestions = questionnaire.questions.filter((q) => q.answer && q.answer.trim());

  logger.info('Starting questionnaire scoring', {
    service: 'questionnaire-scorer',
    questionnaireId,
    totalQuestions: questionnaire.questions.length,
    answeredQuestions: answeredQuestions.length,
  });

  const llm = await createLLM({ temperature: 0, maxTokens: 150 });

  // Score all answered questions in parallel
  const scoringResults = await Promise.allSettled(
    answeredQuestions.map((q) =>
      scoreQuestion(llm, {
        doraArticle: q.doraArticle,
        questionText: q.text,
        answer: q.answer,
      })
    )
  );

  if (job) await job.updateProgress(60);

  // Apply results back to questions array
  answeredQuestions.forEach((q, i) => {
    const result = scoringResults[i];
    const scored =
      result.status === 'fulfilled'
        ? result.value
        : { score: 10, gapLevel: 'missing', reasoning: 'Scoring failed.' };

    const questionInDoc = questionnaire.questions.find((dq) => dq.id === q.id);
    if (questionInDoc) {
      questionInDoc.score = scored.score;
      questionInDoc.gapLevel = scored.gapLevel;
      questionInDoc.reasoning = scored.reasoning;
    }
  });

  // Compute overall score from all scored questions
  const scoredQuestions = questionnaire.questions.filter((q) => q.score !== undefined);
  const overallScore =
    scoredQuestions.length > 0
      ? Math.round(scoredQuestions.reduce((sum, q) => sum + q.score, 0) / scoredQuestions.length)
      : 0;

  questionnaire.overallScore = overallScore;

  if (job) await job.updateProgress(75);

  // Generate executive summary with a larger token budget
  const summaryLlm = await createLLM({ temperature: 0.2, maxTokens: 500 });
  const summary = await generateSummary(summaryLlm, questionnaire);

  const categories = [...new Set(questionnaire.questions.map((q) => q.category))];

  questionnaire.results = {
    summary,
    domainsAnalyzed: categories,
    generatedAt: new Date(),
  };

  questionnaire.status = 'complete';
  questionnaire.statusMessage = 'Scoring complete';

  await questionnaire.save();

  if (job) await job.updateProgress(95);

  logger.info('Questionnaire scoring complete', {
    service: 'questionnaire-scorer',
    questionnaireId,
    overallScore,
    scoredCount: scoredQuestions.length,
  });

  return { overallScore, scoredCount: scoredQuestions.length };
}
