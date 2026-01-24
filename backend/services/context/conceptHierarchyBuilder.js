/**
 * Concept Hierarchy Builder
 *
 * Handles building and managing concept hierarchies.
 * Extracted from conceptHierarchy.js for modularity.
 *
 * @module services/context/conceptHierarchyBuilder
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import { Entity } from '../../models/Entity.js';
import logger from '../../config/logger.js';
import {
  ConceptNode,
  hierarchyLlm,
  HIERARCHY_PROMPT,
  parseHierarchyResponse,
} from './conceptHierarchySchema.js';

/**
 * Build hierarchy from domain profile using LLM
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} domainProfile - Domain profile from domainAwareness
 * @returns {Promise<ConceptNode[]>} Root nodes
 */
export async function buildHierarchyFromProfile(workspaceId, domainProfile) {
  const startTime = Date.now();

  logger.info('Building concept hierarchy', {
    service: 'concept-hierarchy',
    workspaceId,
  });

  // Get topics from domain profile
  const topics = domainProfile.coreTopics?.map((t) => t.name) || [];

  // Get entities grouped by type
  const entities = await Entity.find({ workspaceId })
    .select('name type')
    .sort({ 'stats.totalMentions': -1 })
    .limit(100)
    .lean();

  const entityGroups = {};
  for (const e of entities) {
    if (!entityGroups[e.type]) entityGroups[e.type] = [];
    if (entityGroups[e.type].length < 15) {
      entityGroups[e.type].push(e.name);
    }
  }

  // Use LLM to build hierarchy
  const chain = HIERARCHY_PROMPT.pipe(hierarchyLlm).pipe(new StringOutputParser());

  const response = await chain.invoke({
    domain: domainProfile.domain?.primary || 'general',
    topics: topics.slice(0, 30).join(', '),
    entities: JSON.stringify(entityGroups),
  });

  const parsed = parseHierarchyResponse(response);

  // Clear existing hierarchy
  await ConceptNode.deleteMany({ workspaceId });

  // Build nodes from hierarchy
  const rootNodes = await createNodesFromHierarchy(workspaceId, parsed.hierarchy || [], null, []);

  // Add relationships
  if (parsed.relationships) {
    await addRelationships(workspaceId, parsed.relationships);
  }

  // Link entities to concepts
  await linkEntitiesToConcepts(workspaceId);

  logger.info('Concept hierarchy built', {
    service: 'concept-hierarchy',
    workspaceId,
    rootNodes: rootNodes.length,
    processingTimeMs: Date.now() - startTime,
  });

  return rootNodes;
}

/**
 * Recursively create nodes from hierarchy
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Array} items - Hierarchy items
 * @param {ObjectId|null} parentId - Parent node ID
 * @param {Array} ancestors - Ancestor IDs
 * @returns {Promise<ConceptNode[]>}
 */
export async function createNodesFromHierarchy(workspaceId, items, parentId, ancestors) {
  const nodes = [];

  for (const item of items) {
    const node = await ConceptNode.create({
      workspaceId,
      name: item.name,
      level: item.level || ancestors.length,
      parent: parentId,
      ancestors: ancestors,
      description: item.description || '',
      keywords: item.keywords || [],
    });

    nodes.push(node);

    // Process children
    if (item.children && item.children.length > 0) {
      const childNodes = await createNodesFromHierarchy(workspaceId, item.children, node._id, [
        ...ancestors,
        node._id,
      ]);

      // Update parent with children
      node.children = childNodes.map((c) => c._id);
      node.isLeaf = false;
      await node.save();
    }
  }

  return nodes;
}

/**
 * Add relationships between concepts
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Array} relationships - Relationships from LLM
 */
export async function addRelationships(workspaceId, relationships) {
  for (const rel of relationships) {
    const fromNode = await ConceptNode.findOne({
      workspaceId,
      normalizedName: rel.from?.toLowerCase().replace(/\s+/g, '_'),
    });

    const toNode = await ConceptNode.findOne({
      workspaceId,
      normalizedName: rel.to?.toLowerCase().replace(/\s+/g, '_'),
    });

    if (fromNode && toNode) {
      fromNode.related.push({
        conceptId: toNode._id,
        relationship: rel.type || 'similar',
        strength: 0.7,
      });
      await fromNode.save();
    }
  }
}

/**
 * Link entities to relevant concepts
 *
 * @param {string} workspaceId - Workspace ID
 */
export async function linkEntitiesToConcepts(workspaceId) {
  const entities = await Entity.find({ workspaceId }).select('name type').lean();
  const concepts = await ConceptNode.find({ workspaceId }).lean();

  for (const entity of entities) {
    const entityNameLower = entity.name.toLowerCase();

    // Find matching concepts
    for (const concept of concepts) {
      const conceptNameLower = concept.name.toLowerCase();

      if (
        entityNameLower.includes(conceptNameLower) ||
        conceptNameLower.includes(entityNameLower) ||
        concept.keywords?.some((k) => entityNameLower.includes(k.toLowerCase()))
      ) {
        await ConceptNode.findByIdAndUpdate(concept._id, {
          $addToSet: { entities: entity._id },
          $inc: { documentCount: 1 },
        });
      }
    }
  }
}

/**
 * Convert node to tree structure for display
 *
 * @param {Object} node - Concept node
 * @returns {Object} Tree representation
 */
export function nodeToTree(node) {
  return {
    id: node._id.toString(),
    name: node.name,
    level: node.level,
    children: (node.children || []).map((c) => nodeToTree(c)),
    entityCount: node.entities?.length || 0,
    isLeaf: node.isLeaf,
  };
}

/**
 * Simplify node for LLM prompts
 *
 * @param {Object} node - Concept node
 * @returns {Object} Simplified representation
 */
export function simplifyNode(node) {
  return {
    name: node.name,
    children: node.children?.map((c) => simplifyNode(c)) || [],
  };
}

/**
 * Get concept path to root
 *
 * @param {ObjectId} conceptId - Concept ID
 * @returns {Promise<string[]>} Path names
 */
export async function getConceptPath(conceptId) {
  const concept = await ConceptNode.findById(conceptId).populate('ancestors', 'name').lean();

  if (!concept) return [];

  const path = concept.ancestors?.map((a) => a.name) || [];
  path.push(concept.name);
  return path;
}
