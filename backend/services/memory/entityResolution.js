/**
 * Cross-Document Entity Resolution Service
 *
 * M3 COMPRESSED MEMORY: Automatic entity linking across documents
 * - Detect duplicate entities using string similarity
 * - Use embeddings for semantic matching
 * - Merge entities with confidence scoring
 * - Terminology normalization
 *
 * @module services/memory/entityResolution
 */

import { Entity } from '../../models/Entity.js';
import { embeddings } from '../../config/embeddings.js';
import logger from '../../config/logger.js';

// Import similarity functions
import { cosineSimilarity, combinedStringSimilarity } from './entitySimilarity.js';

// Import merge functions
import {
  mergeEntities,
  autoMergeDuplicates,
  normalizeTerminology,
  generateEmbedding,
  batchGenerateEmbeddings,
} from './entityMerger.js';

/**
 * Entity Resolution Manager
 */
class EntityResolutionManager {
  constructor() {
    this.minSimilarityThreshold = 0.7;
    this.autoMergeThreshold = 0.95;
    this.semanticWeight = 0.4;
    this.stringWeight = 0.6;
  }

  /**
   * Find candidate matches for an entity
   */
  async findCandidates(workspaceId, name, type, options = {}) {
    const { excludeId = null, limit = 10 } = options;
    const normalizedName = name.toLowerCase().trim();
    const candidates = [];

    // 1. Find exact matches
    const exactMatches = await Entity.find({
      workspaceId,
      type,
      _id: { $ne: excludeId },
      $or: [{ normalizedName }, { aliases: normalizedName }],
    });

    for (const entity of exactMatches) {
      candidates.push({
        entity,
        similarity: 1.0,
        matchType: 'exact',
      });
    }

    // 2. Find fuzzy matches using regex
    const fuzzyPattern = normalizedName.split(/\s+/).join('.*');
    const fuzzyMatches = await Entity.find({
      workspaceId,
      type,
      _id: { $ne: excludeId },
      normalizedName: { $regex: new RegExp(fuzzyPattern, 'i') },
    }).limit(50);

    for (const entity of fuzzyMatches) {
      if (candidates.some((c) => c.entity._id.equals(entity._id))) continue;

      const stringSim = combinedStringSimilarity(normalizedName, entity.normalizedName);

      if (stringSim >= this.minSimilarityThreshold) {
        candidates.push({
          entity,
          similarity: stringSim,
          matchType: 'fuzzy',
        });
      }
    }

    // 3. Check aliases
    const aliasMatches = await Entity.find({
      workspaceId,
      type,
      _id: { $ne: excludeId },
      aliases: { $regex: new RegExp(normalizedName.substring(0, 3), 'i') },
    }).limit(30);

    for (const entity of aliasMatches) {
      if (candidates.some((c) => c.entity._id.equals(entity._id))) continue;

      const aliasSim = Math.max(
        ...entity.aliases.map((alias) =>
          combinedStringSimilarity(normalizedName, alias.toLowerCase())
        ),
        0
      );

      if (aliasSim >= this.minSimilarityThreshold) {
        candidates.push({
          entity,
          similarity: aliasSim,
          matchType: 'alias',
        });
      }
    }

    // Sort by similarity and limit
    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates.slice(0, limit);
  }

  /**
   * Resolve entity with semantic similarity
   */
  async resolveEntity(workspaceId, name, type, description = '') {
    const startTime = Date.now();

    try {
      const candidates = await this.findCandidates(workspaceId, name, type);

      if (candidates.length === 0) {
        return { entity: null, isNew: true, confidence: 1.0 };
      }

      // If exact match with high similarity, return it
      const exactMatch = candidates.find((c) => c.similarity >= 0.99);
      if (exactMatch) {
        return {
          entity: exactMatch.entity,
          isNew: false,
          confidence: exactMatch.similarity,
        };
      }

      // For fuzzy matches, use semantic similarity if description available
      if (description && candidates.length > 0) {
        const newEmbedding = await embeddings.embedQuery(`${name}: ${description}`);

        for (const candidate of candidates) {
          if (candidate.entity.embedding && candidate.entity.embedding.length > 0) {
            const semanticSim = cosineSimilarity(newEmbedding, candidate.entity.embedding);
            candidate.semanticSimilarity = semanticSim;
            candidate.combinedSimilarity =
              this.stringWeight * candidate.similarity + this.semanticWeight * semanticSim;
          } else {
            candidate.combinedSimilarity = candidate.similarity;
          }
        }

        candidates.sort(
          (a, b) => (b.combinedSimilarity || b.similarity) - (a.combinedSimilarity || a.similarity)
        );
      }

      const topCandidate = candidates[0];
      const finalSimilarity = topCandidate.combinedSimilarity || topCandidate.similarity;

      if (finalSimilarity >= this.minSimilarityThreshold) {
        logger.debug('Entity resolved to existing', {
          service: 'entity-resolution',
          name,
          matchedTo: topCandidate.entity.name,
          similarity: finalSimilarity.toFixed(3),
          matchType: topCandidate.matchType,
          processingTimeMs: Date.now() - startTime,
        });

        return {
          entity: topCandidate.entity,
          isNew: false,
          confidence: finalSimilarity,
        };
      }

      return { entity: null, isNew: true, confidence: 1.0 };
    } catch (error) {
      logger.error('Entity resolution failed', {
        service: 'entity-resolution',
        name,
        type,
        error: error.message,
      });
      return { entity: null, isNew: true, confidence: 0.5 };
    }
  }

  /**
   * Find duplicate entities in workspace
   */
  async findDuplicates(workspaceId, options = {}) {
    const { minSimilarity = 0.8, limit = 50 } = options;
    const startTime = Date.now();

    const duplicateGroups = [];
    const processed = new Set();

    const entities = await Entity.find({ workspaceId })
      .select('name normalizedName type aliases embedding stats')
      .sort({ 'stats.totalMentions': -1 });

    for (const entity of entities) {
      if (processed.has(entity._id.toString())) continue;

      const candidates = await this.findCandidates(workspaceId, entity.name, entity.type, {
        excludeId: entity._id,
        limit: 5,
      });

      const duplicates = candidates.filter(
        (c) => c.similarity >= minSimilarity && !processed.has(c.entity._id.toString())
      );

      if (duplicates.length > 0) {
        duplicateGroups.push({
          primary: entity,
          duplicates: duplicates.map((d) => ({
            entity: d.entity,
            similarity: d.similarity,
            matchType: d.matchType,
          })),
        });

        processed.add(entity._id.toString());
        for (const d of duplicates) {
          processed.add(d.entity._id.toString());
        }
      }
    }

    logger.info('Found duplicate entity groups', {
      service: 'entity-resolution',
      workspaceId,
      totalEntities: entities.length,
      duplicateGroups: duplicateGroups.length,
      processingTimeMs: Date.now() - startTime,
    });

    return duplicateGroups.slice(0, limit);
  }

  /**
   * Merge duplicate entities - delegates to entityMerger
   */
  async mergeEntities(workspaceId, primaryId, duplicateIds) {
    return mergeEntities(workspaceId, primaryId, duplicateIds);
  }

  /**
   * Auto-merge high-confidence duplicates
   */
  async autoMergeDuplicates(workspaceId, options = {}) {
    const { minSimilarity = 0.95 } = options;
    const duplicateGroups = await this.findDuplicates(workspaceId, { minSimilarity });
    return autoMergeDuplicates(workspaceId, duplicateGroups, {
      ...options,
      autoMergeThreshold: this.autoMergeThreshold,
    });
  }

  /**
   * Normalize entity terminology - delegates to entityMerger
   */
  async normalizeTerminology(workspaceId, canonicalMap) {
    return normalizeTerminology(workspaceId, canonicalMap);
  }

  /**
   * Generate entity embedding - delegates to entityMerger
   */
  async generateEmbedding(entityId) {
    return generateEmbedding(entityId);
  }

  /**
   * Batch generate embeddings - delegates to entityMerger
   */
  async batchGenerateEmbeddings(workspaceId, options = {}) {
    return batchGenerateEmbeddings(workspaceId, options);
  }

  /**
   * Get resolution statistics
   */
  async getStats(workspaceId) {
    const [
      totalEntities,
      entitiesWithEmbeddings,
      entitiesWithAliases,
      avgAliasCount,
      typeDistribution,
    ] = await Promise.all([
      Entity.countDocuments({ workspaceId }),
      Entity.countDocuments({
        workspaceId,
        embedding: { $exists: true, $ne: [] },
      }),
      Entity.countDocuments({
        workspaceId,
        'aliases.0': { $exists: true },
      }),
      Entity.aggregate([
        { $match: { workspaceId } },
        { $project: { aliasCount: { $size: { $ifNull: ['$aliases', []] } } } },
        { $group: { _id: null, avg: { $avg: '$aliasCount' } } },
      ]).then((r) => r[0]?.avg || 0),
      Entity.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Find potential duplicates (quick scan)
    const potentialDuplicates = await this.findDuplicates(workspaceId, {
      minSimilarity: 0.8,
      limit: 10,
    });

    return {
      totalEntities,
      entitiesWithEmbeddings,
      embeddingCoverage:
        totalEntities > 0
          ? ((entitiesWithEmbeddings / totalEntities) * 100).toFixed(1) + '%'
          : '0%',
      entitiesWithAliases,
      avgAliasCount: avgAliasCount.toFixed(1),
      typeDistribution: Object.fromEntries(typeDistribution.map((t) => [t._id, t.count])),
      potentialDuplicateGroups: potentialDuplicates.length,
    };
  }
}

// Singleton instance
export const entityResolution = new EntityResolutionManager();

// Export class for testing
export { EntityResolutionManager };
