/**
 * Concept Hierarchy Service
 *
 * KNOWLEDGE CONTEXT: Manages ontology and taxonomy of concepts
 * - Builds hierarchical concept structure
 * - Identifies parent-child relationships
 * - Enables concept-based navigation
 * - Supports topic boundary detection
 *
 * @module services/context/conceptHierarchy
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import logger from '../../config/logger.js';

// Import schema and prompts
import {
  ConceptNode,
  hierarchyLlm,
  CONCEPT_LOOKUP_PROMPT,
  parseConceptLookupResponse,
} from './conceptHierarchySchema.js';

// Import builder functions
import {
  buildHierarchyFromProfile,
  nodeToTree,
  simplifyNode,
  getConceptPath,
} from './conceptHierarchyBuilder.js';

// Re-export for backward compatibility
export { ConceptNode };

/**
 * Concept Hierarchy Manager
 */
class ConceptHierarchyManager {
  constructor() {
    this.hierarchyCache = new Map();
    this.cacheMaxAge = 30 * 60 * 1000;
  }

  /**
   * Build concept hierarchy for workspace
   */
  async buildHierarchy(workspaceId, domainProfile) {
    try {
      const rootNodes = await buildHierarchyFromProfile(workspaceId, domainProfile);
      this.hierarchyCache.delete(workspaceId);
      return rootNodes;
    } catch (error) {
      logger.error('Failed to build concept hierarchy', {
        service: 'concept-hierarchy',
        workspaceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get hierarchy for workspace
   */
  async getHierarchy(workspaceId) {
    // Check cache
    const cached = this.hierarchyCache.get(workspaceId);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.hierarchy;
    }

    const roots = await ConceptNode.find({ workspaceId, level: 0 })
      .populate({
        path: 'children',
        populate: {
          path: 'children',
          populate: { path: 'children' },
        },
      })
      .lean();

    const hierarchy = {
      roots: roots.map((r) => nodeToTree(r)),
      totalConcepts: await ConceptNode.countDocuments({ workspaceId }),
    };

    this.hierarchyCache.set(workspaceId, { hierarchy, timestamp: Date.now() });

    return hierarchy;
  }

  /**
   * Find concepts relevant to query
   */
  async findRelevantConcepts(workspaceId, query) {
    const hierarchy = await this.getHierarchy(workspaceId);

    if (hierarchy.totalConcepts === 0) {
      return {
        relevantConcepts: [],
        primaryConcept: null,
        conceptPath: [],
        confidence: 0,
      };
    }

    // Quick keyword matching first
    const queryLower = query.toLowerCase();
    const allConcepts = await ConceptNode.find({ workspaceId }).lean();

    const matches = allConcepts.filter(
      (c) =>
        queryLower.includes(c.name.toLowerCase()) ||
        c.keywords?.some((k) => queryLower.includes(k.toLowerCase()))
    );

    if (matches.length > 0) {
      matches.sort((a, b) => b.level - a.level);

      const primary = matches[0];
      const path = await getConceptPath(primary._id);

      return {
        relevantConcepts: matches.map((m) => m.name),
        primaryConcept: primary.name,
        conceptPath: path,
        confidence: 0.85,
      };
    }

    // Use LLM for semantic matching
    try {
      const hierarchyStr = JSON.stringify(
        hierarchy.roots.map((r) => simplifyNode(r)),
        null,
        2
      );

      const chain = CONCEPT_LOOKUP_PROMPT.pipe(hierarchyLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        hierarchy: hierarchyStr,
        query,
      });

      return parseConceptLookupResponse(response);
    } catch (error) {
      logger.warn('Concept lookup LLM failed', {
        service: 'concept-hierarchy',
        error: error.message,
      });

      return {
        relevantConcepts: [],
        primaryConcept: null,
        conceptPath: [],
        confidence: 0.3,
      };
    }
  }

  /**
   * Get concept details
   */
  async getConceptDetails(workspaceId, conceptName) {
    const concept = await ConceptNode.findOne({
      workspaceId,
      normalizedName: conceptName.toLowerCase().replace(/\s+/g, '_'),
    })
      .populate('parent', 'name')
      .populate('children', 'name')
      .populate('related.conceptId', 'name')
      .populate('entities', 'name type')
      .lean();

    if (!concept) return null;

    return {
      name: concept.name,
      level: concept.level,
      parent: concept.parent?.name || null,
      children: concept.children?.map((c) => c.name) || [],
      related:
        concept.related?.map((r) => ({
          name: r.conceptId?.name,
          relationship: r.relationship,
        })) || [],
      entities:
        concept.entities?.slice(0, 20).map((e) => ({
          name: e.name,
          type: e.type,
        })) || [],
      coverage: concept.coverage,
    };
  }

  /**
   * Get statistics
   */
  async getStats(workspaceId) {
    const [total, byLevel, leafCount] = await Promise.all([
      ConceptNode.countDocuments({ workspaceId }),
      ConceptNode.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      ConceptNode.countDocuments({ workspaceId, isLeaf: true }),
    ]);

    return {
      totalConcepts: total,
      byLevel: byLevel.map((l) => ({ level: l._id, count: l.count })),
      leafConcepts: leafCount,
      branchConcepts: total - leafCount,
      maxDepth: byLevel.length > 0 ? Math.max(...byLevel.map((l) => l._id)) : 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache(workspaceId = null) {
    if (workspaceId) {
      this.hierarchyCache.delete(workspaceId);
    } else {
      this.hierarchyCache.clear();
    }
  }
}

// Singleton
export const conceptHierarchy = new ConceptHierarchyManager();
export { ConceptHierarchyManager };
