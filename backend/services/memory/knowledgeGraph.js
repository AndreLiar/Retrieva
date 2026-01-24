/**
 * Knowledge Graph Service
 *
 * M3 COMPRESSED MEMORY: Graph-based knowledge representation
 * - Entity relationship management
 * - Graph traversal for context enrichment
 * - Path finding between concepts
 * - Cluster detection for related topics
 *
 * @module services/memory/knowledgeGraph
 */

import { Entity } from '../../models/Entity.js';
import { DocumentSummary } from '../../models/DocumentSummary.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} GraphNode
 * @property {string} id - Entity ID
 * @property {string} name - Entity name
 * @property {string} type - Entity type
 * @property {number} weight - Node importance weight
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} source - Source entity ID
 * @property {string} target - Target entity ID
 * @property {string} type - Relationship type
 * @property {number} weight - Edge weight/strength
 */

/**
 * Knowledge Graph Manager
 */
class KnowledgeGraph {
  /**
   * Get subgraph centered on an entity
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} entityId - Center entity ID
   * @param {Object} options - Query options
   * @returns {Promise<{nodes: GraphNode[], edges: GraphEdge[]}>}
   */
  async getSubgraph(workspaceId, entityId, options = {}) {
    const { depth = 2, maxNodes = 50 } = options;

    const visited = new Set();
    const nodes = [];
    const edges = [];

    // BFS traversal
    const queue = [{ id: entityId, currentDepth: 0 }];

    while (queue.length > 0 && nodes.length < maxNodes) {
      const { id, currentDepth } = queue.shift();

      if (visited.has(id) || currentDepth > depth) continue;
      visited.add(id);

      const entity = await Entity.findById(id).populate(
        'relationships.entityId',
        'name type stats'
      );

      if (!entity || entity.workspaceId !== workspaceId) continue;

      // Add node
      nodes.push({
        id: entity._id.toString(),
        name: entity.name,
        type: entity.type,
        weight: this._calculateNodeWeight(entity),
        description: entity.description,
        documentCount: entity.stats?.documentCount || 0,
      });

      // Process relationships
      for (const rel of entity.relationships || []) {
        if (!rel.entityId) continue;

        const targetId = rel.entityId._id?.toString() || rel.entityId.toString();

        // Add edge
        edges.push({
          source: entity._id.toString(),
          target: targetId,
          type: rel.type,
          weight: rel.strength || 0.5,
        });

        // Queue for next level
        if (!visited.has(targetId) && currentDepth < depth) {
          queue.push({ id: targetId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Find path between two entities
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} sourceId - Source entity ID
   * @param {string} targetId - Target entity ID
   * @param {Object} options - Query options
   * @returns {Promise<{path: string[], relationships: string[]}|null>}
   */
  async findPath(workspaceId, sourceId, targetId, options = {}) {
    const { maxDepth = 5 } = options;

    const visited = new Set();
    const queue = [{ id: sourceId, path: [sourceId], rels: [] }];

    while (queue.length > 0) {
      const { id, path, rels } = queue.shift();

      if (path.length > maxDepth) continue;
      if (visited.has(id)) continue;
      visited.add(id);

      if (id === targetId) {
        // Resolve entity names for the path
        const entityNames = await Entity.find({ _id: { $in: path } }).select('name');
        const nameMap = new Map(entityNames.map((e) => [e._id.toString(), e.name]));

        return {
          path: path.map((id) => nameMap.get(id) || id),
          pathIds: path,
          relationships: rels,
        };
      }

      const entity = await Entity.findById(id).select('relationships workspaceId');
      if (!entity || entity.workspaceId !== workspaceId) continue;

      for (const rel of entity.relationships || []) {
        const nextId = rel.entityId?.toString();
        if (nextId && !visited.has(nextId)) {
          queue.push({
            id: nextId,
            path: [...path, nextId],
            rels: [...rels, rel.type],
          });
        }
      }
    }

    return null;
  }

  /**
   * Get related entities using graph traversal
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} entityIds - Starting entity IDs
   * @param {Object} options - Query options
   * @returns {Promise<Entity[]>}
   */
  async getRelatedEntities(workspaceId, entityIds, options = {}) {
    const { maxResults = 20, minStrength = 0.3 } = options;

    const relatedScores = new Map();

    for (const entityId of entityIds) {
      const entity = await Entity.findById(entityId).populate(
        'relationships.entityId',
        'name type workspaceId'
      );

      if (!entity) continue;

      for (const rel of entity.relationships || []) {
        if (!rel.entityId || rel.strength < minStrength) continue;
        if (rel.entityId.workspaceId !== workspaceId) continue;

        const relId = rel.entityId._id.toString();
        const currentScore = relatedScores.get(relId) || 0;
        relatedScores.set(relId, currentScore + rel.strength);
      }
    }

    // Remove source entities
    for (const id of entityIds) {
      relatedScores.delete(id);
    }

    // Sort by score and get top results
    const sortedIds = Array.from(relatedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults)
      .map(([id]) => id);

    return Entity.find({ _id: { $in: sortedIds } }).select('name type description stats');
  }

  /**
   * Find entity clusters (communities)
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<{topic: string, entities: Entity[]}>>}
   */
  async findClusters(workspaceId, options = {}) {
    const { minClusterSize = 3, maxClusters = 10 } = options;

    // Get all entities with relationships
    const entities = await Entity.find({
      workspaceId,
      'relationships.0': { $exists: true },
    }).select('name type relationships stats');

    // Build adjacency map
    const adjacency = new Map();
    for (const entity of entities) {
      const id = entity._id.toString();
      if (!adjacency.has(id)) adjacency.set(id, new Set());

      for (const rel of entity.relationships || []) {
        const targetId = rel.entityId?.toString();
        if (targetId) {
          adjacency.get(id).add(targetId);
          if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
          adjacency.get(targetId).add(id);
        }
      }
    }

    // Simple clustering: group by connectivity
    const visited = new Set();
    const clusters = [];

    for (const [id] of adjacency) {
      if (visited.has(id)) continue;

      const cluster = [];
      const queue = [id];

      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        cluster.push(current);

        const neighbors = adjacency.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length >= minClusterSize) {
        clusters.push(cluster);
      }
    }

    // Get entity details for clusters
    const result = [];
    for (const clusterIds of clusters.slice(0, maxClusters)) {
      const clusterEntities = await Entity.find({ _id: { $in: clusterIds } })
        .select('name type description stats')
        .sort({ 'stats.totalMentions': -1 });

      // Derive topic from most mentioned entity
      const topEntity = clusterEntities[0];
      result.push({
        topic: topEntity?.name || 'Unknown',
        entityCount: clusterEntities.length,
        entities: clusterEntities.slice(0, 10),
        types: [...new Set(clusterEntities.map((e) => e.type))],
      });
    }

    return result.sort((a, b) => b.entityCount - a.entityCount);
  }

  /**
   * Get knowledge context for a query
   * Enriches RAG context with graph-based knowledge
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string[]} entityNames - Entity names mentioned in query
   * @returns {Promise<string>}
   */
  async getKnowledgeContext(workspaceId, entityNames) {
    if (!entityNames || entityNames.length === 0) return '';

    // Find entities
    const entities = await Entity.find({
      workspaceId,
      normalizedName: { $in: entityNames.map((n) => n.toLowerCase()) },
    }).populate('relationships.entityId', 'name type');

    if (entities.length === 0) return '';

    // Build knowledge context
    const contextParts = ['[Knowledge Graph Context]'];

    for (const entity of entities) {
      const relatedInfo = [];

      // Get direct relationships
      for (const rel of (entity.relationships || []).slice(0, 5)) {
        if (rel.entityId) {
          relatedInfo.push(`${rel.type}: ${rel.entityId.name}`);
        }
      }

      contextParts.push(
        `- ${entity.name} (${entity.type})${entity.description ? ': ' + entity.description : ''}` +
          (relatedInfo.length > 0 ? `\n  Relations: ${relatedInfo.join(', ')}` : '')
      );
    }

    return contextParts.join('\n');
  }

  /**
   * Merge duplicate entities
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} primaryId - Primary entity to keep
   * @param {string} duplicateId - Duplicate entity to merge
   * @returns {Promise<Entity>}
   */
  async mergeEntities(workspaceId, primaryId, duplicateId) {
    const primary = await Entity.findById(primaryId);
    const duplicate = await Entity.findById(duplicateId);

    if (!primary || !duplicate) {
      throw new Error('Entity not found');
    }

    if (primary.workspaceId !== workspaceId || duplicate.workspaceId !== workspaceId) {
      throw new Error('Entity workspace mismatch');
    }

    // Merge aliases
    const allAliases = new Set([
      ...(primary.aliases || []),
      ...(duplicate.aliases || []),
      duplicate.name,
    ]);
    primary.aliases = Array.from(allAliases);

    // Merge document sources
    for (const docSource of duplicate.documentSources || []) {
      const existing = primary.documentSources.find((d) => d.sourceId === docSource.sourceId);
      if (existing) {
        existing.mentionCount += docSource.mentionCount;
        existing.contexts.push(...docSource.contexts.slice(0, 3));
      } else {
        primary.documentSources.push(docSource);
      }
    }

    // Merge relationships
    for (const rel of duplicate.relationships || []) {
      const existing = primary.relationships.find(
        (r) => r.entityId.toString() === rel.entityId.toString() && r.type === rel.type
      );
      if (existing) {
        existing.strength = Math.min(1, existing.strength + rel.strength * 0.5);
      } else {
        primary.relationships.push(rel);
      }
    }

    // Update stats
    primary.stats.totalMentions += duplicate.stats?.totalMentions || 0;
    primary.stats.documentCount = primary.documentSources.length;
    primary.stats.conversationMentions += duplicate.stats?.conversationMentions || 0;

    // Update relationships pointing to duplicate
    await Entity.updateMany(
      { 'relationships.entityId': duplicateId },
      { $set: { 'relationships.$.entityId': primaryId } }
    );

    // Delete duplicate
    await Entity.findByIdAndDelete(duplicateId);

    await primary.save();

    logger.info('Merged entities', {
      service: 'knowledge-graph',
      primaryId,
      duplicateId,
      newAliasCount: primary.aliases.length,
    });

    return primary;
  }

  /**
   * Get graph statistics
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const entityCount = await Entity.countDocuments({ workspaceId });

    const relationshipStats = await Entity.aggregate([
      { $match: { workspaceId } },
      { $unwind: { path: '$relationships', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$relationships.type',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const typeStats = await Entity.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalMentions: { $sum: '$stats.totalMentions' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const totalRelationships = relationshipStats.reduce((sum, r) => sum + (r.count || 0), 0);

    return {
      entityCount,
      relationshipCount: totalRelationships,
      relationshipTypes: relationshipStats.filter((r) => r._id),
      entityTypes: typeStats,
      density: entityCount > 1 ? totalRelationships / (entityCount * (entityCount - 1)) : 0,
    };
  }

  /**
   * Calculate node importance weight
   * @private
   */
  _calculateNodeWeight(entity) {
    const mentionWeight = Math.log10((entity.stats?.totalMentions || 1) + 1);
    const docWeight = Math.log10((entity.stats?.documentCount || 1) + 1);
    const relWeight = Math.log10((entity.relationships?.length || 0) + 1);

    return (mentionWeight + docWeight + relWeight) / 3;
  }
}

// Singleton instance
export const knowledgeGraph = new KnowledgeGraph();

// Export class for testing
export { KnowledgeGraph };
