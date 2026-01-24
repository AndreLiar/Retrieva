/**
 * Entity Merger Module
 *
 * Handles entity merging, deduplication, and terminology normalization.
 * Extracted from entityResolution.js for modularity.
 *
 * @module services/memory/entityMerger
 */

import { Entity } from '../../models/Entity.js';
import { embeddings } from '../../config/embeddings.js';
import logger from '../../config/logger.js';

/**
 * Merge duplicate entities
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} primaryId - Primary entity ID to keep
 * @param {string[]} duplicateIds - IDs of entities to merge into primary
 * @returns {Promise<Entity>}
 */
export async function mergeEntities(workspaceId, primaryId, duplicateIds) {
  const startTime = Date.now();

  const primary = await Entity.findById(primaryId);
  if (!primary || primary.workspaceId !== workspaceId) {
    throw new Error('Primary entity not found');
  }

  const duplicates = await Entity.find({
    _id: { $in: duplicateIds },
    workspaceId,
  });

  // Merge data from duplicates
  for (const dup of duplicates) {
    // Merge aliases
    const allAliases = new Set([...(primary.aliases || []), ...(dup.aliases || []), dup.name]);
    primary.aliases = Array.from(allAliases);

    // Merge document sources
    for (const docSource of dup.documentSources || []) {
      const existing = primary.documentSources.find((d) => d.sourceId === docSource.sourceId);
      if (existing) {
        existing.mentionCount += docSource.mentionCount;
        existing.contexts.push(...(docSource.contexts || []).slice(0, 2));
        existing.contexts = existing.contexts.slice(-5);
      } else {
        primary.documentSources.push(docSource);
      }
    }

    // Merge relationships
    for (const rel of dup.relationships || []) {
      // Don't create self-references
      if (rel.entityId.toString() === primaryId) continue;

      const existing = primary.relationships.find(
        (r) => r.entityId.toString() === rel.entityId.toString() && r.type === rel.type
      );
      if (existing) {
        existing.strength = Math.min(1, existing.strength + rel.strength * 0.3);
      } else {
        primary.relationships.push(rel);
      }
    }

    // Merge stats
    primary.stats.totalMentions += dup.stats?.totalMentions || 0;
    primary.stats.conversationMentions += dup.stats?.conversationMentions || 0;

    // Use better description if available
    if (!primary.description && dup.description) {
      primary.description = dup.description;
    }

    // Use higher confidence embedding if available
    if (dup.embedding?.length > 0 && (!primary.embedding || primary.embedding.length === 0)) {
      primary.embedding = dup.embedding;
    }
  }

  // Update document count
  primary.stats.documentCount = primary.documentSources.length;

  // Update relationships pointing to duplicates
  await Entity.updateMany(
    {
      workspaceId,
      'relationships.entityId': { $in: duplicateIds },
    },
    {
      $set: { 'relationships.$[elem].entityId': primaryId },
    },
    {
      arrayFilters: [{ 'elem.entityId': { $in: duplicateIds } }],
    }
  );

  // Delete duplicates
  await Entity.deleteMany({ _id: { $in: duplicateIds } });

  // Save primary
  await primary.save();

  logger.info('Merged entities', {
    service: 'entity-resolution',
    primaryId,
    mergedCount: duplicates.length,
    newAliasCount: primary.aliases.length,
    processingTimeMs: Date.now() - startTime,
  });

  return primary;
}

/**
 * Auto-merge high-confidence duplicates
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Array} duplicateGroups - Groups of duplicate entities
 * @param {Object} options - Options
 * @returns {Promise<{merged: number, groups: number}>}
 */
export async function autoMergeDuplicates(workspaceId, duplicateGroups, options = {}) {
  const { autoMergeThreshold = 0.95, maxMergesPerRun = 50 } = options;
  const startTime = Date.now();

  let merged = 0;
  let groupsProcessed = 0;

  for (const group of duplicateGroups.slice(0, maxMergesPerRun)) {
    // Only auto-merge if all duplicates have very high similarity
    const allHighSimilarity = group.duplicates.every((d) => d.similarity >= autoMergeThreshold);

    if (allHighSimilarity) {
      const duplicateIds = group.duplicates.map((d) => d.entity._id);
      await mergeEntities(workspaceId, group.primary._id, duplicateIds);
      merged += duplicateIds.length;
      groupsProcessed++;
    }
  }

  logger.info('Auto-merge completed', {
    service: 'entity-resolution',
    workspaceId,
    groupsProcessed,
    entitiesMerged: merged,
    processingTimeMs: Date.now() - startTime,
  });

  return { merged, groups: groupsProcessed };
}

/**
 * Normalize entity terminology
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Map<string, string>} canonicalMap - Map of term -> canonical term
 * @returns {Promise<number>} Number of entities updated
 */
export async function normalizeTerminology(workspaceId, canonicalMap) {
  let updated = 0;

  for (const [term, canonical] of canonicalMap) {
    const normalizedTerm = term.toLowerCase().trim();
    const entities = await Entity.find({
      workspaceId,
      $or: [
        { normalizedName: normalizedTerm },
        { aliases: { $regex: new RegExp(`^${normalizedTerm}$`, 'i') } },
      ],
    });

    for (const entity of entities) {
      if (entity.normalizedName === normalizedTerm && entity.name !== canonical) {
        // Add old name as alias
        if (!entity.aliases.includes(entity.name)) {
          entity.aliases.push(entity.name);
        }
        // Update to canonical name
        entity.name = canonical;
        entity.normalizedName = canonical.toLowerCase().trim();
        await entity.save();
        updated++;
      }
    }
  }

  logger.info('Terminology normalization complete', {
    service: 'entity-resolution',
    workspaceId,
    mappings: canonicalMap.size,
    entitiesUpdated: updated,
  });

  return updated;
}

/**
 * Generate entity embedding
 *
 * @param {string} entityId - Entity ID
 * @returns {Promise<Entity>}
 */
export async function generateEmbedding(entityId) {
  const entity = await Entity.findById(entityId);
  if (!entity) throw new Error('Entity not found');

  // Create text for embedding
  const textParts = [entity.name];
  if (entity.description) textParts.push(entity.description);
  if (entity.aliases?.length > 0) textParts.push(`Also known as: ${entity.aliases.join(', ')}`);

  // Get contexts
  const contexts = entity.documentSources.flatMap((d) => d.contexts).slice(0, 3);
  if (contexts.length > 0) {
    textParts.push(`Context: ${contexts.join(' ')}`);
  }

  const text = textParts.join('. ');
  entity.embedding = await embeddings.embedQuery(text);
  await entity.save();

  return entity;
}

/**
 * Batch generate embeddings for entities without them
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} options - Options
 * @returns {Promise<number>} Number of embeddings generated
 */
export async function batchGenerateEmbeddings(workspaceId, options = {}) {
  const { limit = 100 } = options;
  const startTime = Date.now();

  const entities = await Entity.find({
    workspaceId,
    $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
  }).limit(limit);

  let generated = 0;
  for (const entity of entities) {
    try {
      await generateEmbedding(entity._id);
      generated++;
    } catch (error) {
      logger.warn('Failed to generate embedding', {
        service: 'entity-resolution',
        entityId: entity._id,
        error: error.message,
      });
    }
  }

  logger.info('Batch embedding generation complete', {
    service: 'entity-resolution',
    workspaceId,
    generated,
    processingTimeMs: Date.now() - startTime,
  });

  return generated;
}
