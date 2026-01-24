/**
 * Domain Awareness Service
 *
 * KNOWLEDGE CONTEXT: Understands what the knowledge base is about
 * - Auto-detects domain/industry from content
 * - Identifies core topics and boundaries
 * - Provides domain context for queries
 * - Detects out-of-scope queries
 *
 * @module services/context/domainAwareness
 */

import mongoose from 'mongoose';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { DocumentSummary } from '../../models/DocumentSummary.js';
import { Entity } from '../../models/Entity.js';
import logger from '../../config/logger.js';

/**
 * Domain profile schema
 */
const domainProfileSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Domain identification
    domain: {
      primary: String, // e.g., "software engineering"
      secondary: [String], // e.g., ["web development", "devops"]
      industry: String, // e.g., "technology"
      confidence: { type: Number, default: 0.5 },
    },

    // Core topics covered
    coreTopics: [
      {
        name: String,
        documentCount: Number,
        entityCount: Number,
        weight: Number, // Importance 0-1
        keywords: [String],
      },
    ],

    // Topic boundaries
    boundaries: {
      includedTopics: [String], // Topics definitely covered
      excludedTopics: [String], // Topics definitely NOT covered
      borderlineTopics: [String], // Topics partially covered
    },

    // Content characteristics
    characteristics: {
      totalDocuments: { type: Number, default: 0 },
      totalEntities: { type: Number, default: 0 },
      avgDocumentLength: { type: Number, default: 0 },
      contentTypes: [
        {
          type: String,
          count: Number,
        },
      ],
      languages: [
        {
          code: String,
          percentage: Number,
        },
      ],
      technicalLevel: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'mixed'],
        default: 'mixed',
      },
    },

    // Auto-generated description
    description: {
      short: String, // One sentence
      detailed: String, // Paragraph
      forPrompt: String, // Optimized for LLM prompts
    },

    // Analysis metadata
    lastAnalyzed: Date,
    analysisVersion: { type: Number, default: 1 },
    needsReanalysis: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const DomainProfile =
  mongoose.models.DomainProfile || mongoose.model('DomainProfile', domainProfileSchema);

// Analysis LLM
const analysisLlm = new ChatOllama({
  model: process.env.ANALYSIS_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.2,
  numPredict: 1000,
  format: 'json',
});

// Domain analysis prompt
const DOMAIN_ANALYSIS_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a domain analyst. Analyze the provided knowledge base content and identify:
1. Primary domain/field (e.g., "software engineering", "healthcare", "finance")
2. Secondary domains/subfields
3. Industry context
4. Core topics covered
5. Content characteristics

Respond with valid JSON:
{{
  "domain": {{
    "primary": "main domain name",
    "secondary": ["subfield1", "subfield2"],
    "industry": "industry name"
  }},
  "coreTopics": [
    {{"name": "topic", "weight": 0.9, "keywords": ["key1", "key2"]}}
  ],
  "boundaries": {{
    "includedTopics": ["topics definitely covered"],
    "excludedTopics": ["topics NOT covered based on content gaps"],
    "borderlineTopics": ["topics only partially covered"]
  }},
  "characteristics": {{
    "technicalLevel": "basic|intermediate|advanced|mixed"
  }},
  "description": {{
    "short": "One sentence describing this knowledge base",
    "detailed": "A paragraph describing what this knowledge base covers"
  }}
}}`,
  ],
  [
    'user',
    `Document Titles and Topics:
{documentInfo}

Entity Types and Names:
{entityInfo}

Top Keywords:
{keywords}

Analyze this knowledge base and provide domain profile as JSON.`,
  ],
]);

// Scope check prompt
const SCOPE_CHECK_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You determine if a query is within scope of a knowledge base.

Knowledge Base Domain: {domain}
Core Topics: {topics}
Included Topics: {included}
Excluded/Not Covered: {excluded}

Respond with JSON:
{{
  "inScope": true/false,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation",
  "suggestedTopics": ["related topics that ARE covered, if any"]
}}`,
  ],
  [
    'user',
    `Query: {query}

Is this query within scope of this knowledge base?`,
  ],
]);

/**
 * Domain Awareness Manager
 */
class DomainAwarenessManager {
  constructor() {
    this.profileCache = new Map();
    this.cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get or analyze domain profile
   *
   * @param {string} workspaceId - Workspace ID
   * @param {boolean} forceReanalysis - Force reanalysis
   * @returns {Promise<DomainProfile>}
   */
  async getProfile(workspaceId, forceReanalysis = false) {
    // Check cache
    const cached = this.profileCache.get(workspaceId);
    if (cached && !forceReanalysis && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.profile;
    }

    let profile = await DomainProfile.findOne({ workspaceId });

    if (!profile || forceReanalysis || profile.needsReanalysis) {
      profile = await this.analyzeWorkspace(workspaceId);
    }

    // Update cache
    this.profileCache.set(workspaceId, { profile, timestamp: Date.now() });

    return profile;
  }

  /**
   * Analyze workspace to build domain profile
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<DomainProfile>}
   */
  async analyzeWorkspace(workspaceId) {
    const startTime = Date.now();

    logger.info('Analyzing workspace domain', {
      service: 'domain-awareness',
      workspaceId,
    });

    try {
      // Gather document info
      const summaries = await DocumentSummary.find({ workspaceId })
        .select('topics keyPoints summary')
        .limit(100)
        .lean();

      // Gather entity info
      const entities = await Entity.find({ workspaceId })
        .select('name type stats.totalMentions')
        .sort({ 'stats.totalMentions': -1 })
        .limit(200)
        .lean();

      // Build analysis input
      const documentInfo = summaries.map((s) => ({
        topics: s.topics?.slice(0, 5) || [],
        summary: s.summary?.substring(0, 100) || '',
      }));

      const entityInfo = {};
      for (const e of entities) {
        if (!entityInfo[e.type]) entityInfo[e.type] = [];
        if (entityInfo[e.type].length < 20) {
          entityInfo[e.type].push(e.name);
        }
      }

      // Extract keywords from topics
      const allTopics = summaries.flatMap((s) => s.topics || []);
      const keywordCounts = {};
      for (const topic of allTopics) {
        keywordCounts[topic] = (keywordCounts[topic] || 0) + 1;
      }
      const topKeywords = Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([k]) => k);

      // Run LLM analysis
      const chain = DOMAIN_ANALYSIS_PROMPT.pipe(analysisLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        documentInfo: JSON.stringify(documentInfo.slice(0, 50)),
        entityInfo: JSON.stringify(entityInfo),
        keywords: topKeywords.join(', '),
      });

      const analysis = this._parseAnalysisResponse(response);

      // Calculate characteristics
      const characteristics = {
        totalDocuments: summaries.length,
        totalEntities: entities.length,
        avgDocumentLength: 0,
        contentTypes: Object.entries(entityInfo).map(([type, items]) => ({
          type,
          count: items.length,
        })),
        languages: [{ code: 'en', percentage: 100 }],
        technicalLevel: analysis.characteristics?.technicalLevel || 'mixed',
      };

      // Build core topics with weights
      const coreTopics = (analysis.coreTopics || []).map((t) => ({
        name: t.name,
        documentCount: keywordCounts[t.name?.toLowerCase()] || 0,
        entityCount: entities.filter((e) =>
          e.name.toLowerCase().includes(t.name?.toLowerCase() || '')
        ).length,
        weight: t.weight || 0.5,
        keywords: t.keywords || [],
      }));

      // Generate prompt-optimized description
      const forPrompt = this._buildPromptDescription(analysis, coreTopics, characteristics);

      // Save/update profile
      const profile = await DomainProfile.findOneAndUpdate(
        { workspaceId },
        {
          $set: {
            domain: {
              primary: analysis.domain?.primary || 'general',
              secondary: analysis.domain?.secondary || [],
              industry: analysis.domain?.industry || 'general',
              confidence: 0.7,
            },
            coreTopics,
            boundaries: {
              includedTopics: analysis.boundaries?.includedTopics || [],
              excludedTopics: analysis.boundaries?.excludedTopics || [],
              borderlineTopics: analysis.boundaries?.borderlineTopics || [],
            },
            characteristics,
            description: {
              short: analysis.description?.short || '',
              detailed: analysis.description?.detailed || '',
              forPrompt,
            },
            lastAnalyzed: new Date(),
            analysisVersion: 1,
            needsReanalysis: false,
          },
        },
        { upsert: true, new: true }
      );

      logger.info('Workspace domain analysis complete', {
        service: 'domain-awareness',
        workspaceId,
        domain: profile.domain.primary,
        topicsCount: coreTopics.length,
        processingTimeMs: Date.now() - startTime,
      });

      return profile;
    } catch (error) {
      logger.error('Domain analysis failed', {
        service: 'domain-awareness',
        workspaceId,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      // Return minimal profile
      return DomainProfile.findOneAndUpdate(
        { workspaceId },
        {
          $set: {
            domain: { primary: 'general', secondary: [], industry: 'general', confidence: 0.3 },
            lastAnalyzed: new Date(),
            needsReanalysis: true,
          },
        },
        { upsert: true, new: true }
      );
    }
  }

  /**
   * Parse analysis response
   * @private
   */
  _parseAnalysisResponse(response) {
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

  /**
   * Build prompt-optimized description
   * @private
   */
  _buildPromptDescription(analysis, coreTopics, characteristics) {
    const parts = [];

    if (analysis.domain?.primary) {
      parts.push(`This knowledge base covers ${analysis.domain.primary}`);
      if (analysis.domain.secondary?.length > 0) {
        parts.push(`with focus on ${analysis.domain.secondary.slice(0, 3).join(', ')}`);
      }
    }

    if (coreTopics.length > 0) {
      const topNames = coreTopics.slice(0, 5).map((t) => t.name);
      parts.push(`Core topics include: ${topNames.join(', ')}`);
    }

    if (characteristics.technicalLevel !== 'mixed') {
      parts.push(`Content is ${characteristics.technicalLevel} level`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Check if query is in scope
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} query - User query
   * @returns {Promise<Object>}
   */
  async checkScope(workspaceId, query) {
    const profile = await this.getProfile(workspaceId);

    // Quick check - if profile has low confidence, assume in scope
    if (profile.domain.confidence < 0.5) {
      return {
        inScope: true,
        confidence: 0.5,
        reason: 'Domain profile incomplete',
        suggestedTopics: [],
      };
    }

    // Quick keyword check
    const queryLower = query.toLowerCase();
    const includedMatch = profile.boundaries.includedTopics.some((t) =>
      queryLower.includes(t.toLowerCase())
    );
    if (includedMatch) {
      return {
        inScope: true,
        confidence: 0.9,
        reason: 'Query matches covered topics',
        suggestedTopics: [],
      };
    }

    const excludedMatch = profile.boundaries.excludedTopics.some((t) =>
      queryLower.includes(t.toLowerCase())
    );
    if (excludedMatch) {
      return {
        inScope: false,
        confidence: 0.8,
        reason: 'Query matches excluded topics',
        suggestedTopics: profile.boundaries.includedTopics.slice(0, 5),
      };
    }

    // Use LLM for uncertain cases
    try {
      const chain = SCOPE_CHECK_PROMPT.pipe(analysisLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        domain: profile.domain.primary,
        topics: profile.coreTopics.map((t) => t.name).join(', '),
        included: profile.boundaries.includedTopics.join(', ') || 'Not specified',
        excluded: profile.boundaries.excludedTopics.join(', ') || 'Not specified',
        query,
      });

      const result = this._parseScopeResponse(response);

      logger.debug('Scope check completed', {
        service: 'domain-awareness',
        workspaceId,
        inScope: result.inScope,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      logger.warn('Scope check LLM failed, defaulting to in-scope', {
        service: 'domain-awareness',
        error: error.message,
      });

      return {
        inScope: true,
        confidence: 0.5,
        reason: 'Scope check inconclusive',
        suggestedTopics: [],
      };
    }
  }

  /**
   * Parse scope response
   * @private
   */
  _parseScopeResponse(response) {
    try {
      const parsed = JSON.parse(response);
      return {
        inScope: parsed.inScope !== false,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || '',
        suggestedTopics: parsed.suggestedTopics || [],
      };
    } catch {
      return {
        inScope: true,
        confidence: 0.5,
        reason: 'Parse error',
        suggestedTopics: [],
      };
    }
  }

  /**
   * Get domain context for prompts
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<string>}
   */
  async getDomainContext(workspaceId) {
    const profile = await this.getProfile(workspaceId);

    if (!profile.description.forPrompt) {
      return '';
    }

    return `[Knowledge Base Context]\n${profile.description.forPrompt}`;
  }

  /**
   * Mark workspace for reanalysis
   *
   * @param {string} workspaceId - Workspace ID
   */
  async markForReanalysis(workspaceId) {
    await DomainProfile.findOneAndUpdate({ workspaceId }, { $set: { needsReanalysis: true } });

    this.profileCache.delete(workspaceId);
  }

  /**
   * Get domain statistics
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const profile = await this.getProfile(workspaceId);

    return {
      domain: profile.domain,
      topicsCount: profile.coreTopics.length,
      topTopics: profile.coreTopics.slice(0, 10).map((t) => ({
        name: t.name,
        weight: t.weight,
      })),
      characteristics: profile.characteristics,
      boundaries: {
        includedCount: profile.boundaries.includedTopics.length,
        excludedCount: profile.boundaries.excludedTopics.length,
      },
      lastAnalyzed: profile.lastAnalyzed,
    };
  }

  /**
   * Clear cache
   */
  clearCache(workspaceId = null) {
    if (workspaceId) {
      this.profileCache.delete(workspaceId);
    } else {
      this.profileCache.clear();
    }
  }
}

// Singleton
export const domainAwareness = new DomainAwarenessManager();
export { DomainAwarenessManager, DomainProfile };
