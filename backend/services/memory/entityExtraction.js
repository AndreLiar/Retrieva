/**
 * Entity Extraction Service
 *
 * M3 COMPRESSED MEMORY: Extracts entities from documents
 * - People, organizations, concepts, dates, locations
 * - Identifies relationships between entities
 * - Builds knowledge graph connections
 *
 * @module services/memory/entityExtraction
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { Entity } from '../../models/Entity.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} ExtractedEntity
 * @property {string} name - Entity name
 * @property {string} type - Entity type
 * @property {string} [description] - Entity description
 * @property {string[]} [aliases] - Alternative names
 * @property {string} [context] - Context where found
 */

/**
 * @typedef {Object} ExtractedRelationship
 * @property {string} entity1 - First entity name
 * @property {string} entity2 - Second entity name
 * @property {string} type - Relationship type
 * @property {string} [evidence] - Supporting text
 */

// Entity extraction LLM
const extractionLlm = new ChatOllama({
  model: process.env.EXTRACTION_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.1,
  numPredict: 2000,
  format: 'json',
});

// Entity extraction prompt
const EXTRACTION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert at extracting structured information from text.
Extract all meaningful entities and their relationships from the provided content.

Entity types to extract:
- person: Individual people (names, roles)
- organization: Companies, teams, departments
- concept: Key ideas, methodologies, frameworks
- technology: Tools, languages, platforms
- product: Products, features, services
- location: Places, regions
- date: Important dates, deadlines, timelines
- event: Meetings, launches, milestones

Relationship types:
- works_at: Person works at organization
- created_by: Thing created by person/org
- part_of: Component is part of larger thing
- related_to: General relationship
- manages: Person manages thing/person
- depends_on: Thing depends on another
- located_in: Thing is in location

Respond with valid JSON only:
{{
  "entities": [
    {{
      "name": "Entity Name",
      "type": "person|organization|concept|technology|product|location|date|event",
      "description": "Brief description",
      "aliases": ["alt name"],
      "context": "Sentence where found"
    }}
  ],
  "relationships": [
    {{
      "entity1": "First Entity",
      "entity2": "Second Entity",
      "type": "relationship_type",
      "evidence": "Text supporting this relationship"
    }}
  ]
}}`,
  ],
  [
    'user',
    `Document: {title}

Content:
{content}

Extract all entities and relationships as JSON.`,
  ],
]);

/**
 * Parse JSON response from LLM
 * @param {string} response - Raw LLM response
 * @returns {Object} Parsed extraction result
 */
function parseExtractionResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn('Failed to parse extraction response', {
          service: 'entity-extraction',
          response: response.substring(0, 200),
        });
      }
    }
    return { entities: [], relationships: [] };
  }
}

/**
 * Validate entity type
 * @param {string} type - Entity type to validate
 * @returns {string} Valid entity type
 */
function validateEntityType(type) {
  const validTypes = [
    'person',
    'organization',
    'concept',
    'date',
    'location',
    'product',
    'event',
    'technology',
    'other',
  ];
  const normalized = type?.toLowerCase().trim();
  return validTypes.includes(normalized) ? normalized : 'other';
}

/**
 * Extract entities from document content
 *
 * @param {string} content - Document content
 * @param {string} title - Document title
 * @param {Object} options - Extraction options
 * @returns {Promise<{entities: ExtractedEntity[], relationships: ExtractedRelationship[]}>}
 */
export async function extractEntities(content, title, options = {}) {
  const startTime = Date.now();
  const { maxContentLength = 10000 } = options;

  try {
    // Truncate if too long
    const truncatedContent =
      content.length > maxContentLength ? content.substring(0, maxContentLength) : content;

    logger.info('Starting entity extraction', {
      service: 'entity-extraction',
      title,
      contentLength: truncatedContent.length,
    });

    const chain = EXTRACTION_PROMPT.pipe(extractionLlm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      title,
      content: truncatedContent,
    });

    const parsed = parseExtractionResponse(response);

    // Validate and clean entities
    const entities = (parsed.entities || [])
      .filter((e) => e.name && e.type)
      .map((e) => ({
        name: e.name.trim(),
        type: validateEntityType(e.type),
        description: e.description || '',
        aliases: Array.isArray(e.aliases) ? e.aliases : [],
        context: e.context || '',
      }));

    // Validate relationships
    const relationships = (parsed.relationships || [])
      .filter((r) => r.entity1 && r.entity2 && r.type)
      .map((r) => ({
        entity1: r.entity1.trim(),
        entity2: r.entity2.trim(),
        type: r.type,
        evidence: r.evidence || '',
      }));

    logger.info('Entity extraction complete', {
      service: 'entity-extraction',
      title,
      entitiesCount: entities.length,
      relationshipsCount: relationships.length,
      processingTimeMs: Date.now() - startTime,
    });

    return { entities, relationships };
  } catch (error) {
    logger.error('Entity extraction failed', {
      service: 'entity-extraction',
      title,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });

    throw error;
  }
}

/**
 * Process and store extracted entities in database
 *
 * @param {Object} params - Processing parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.documentSourceId - DocumentSource ID
 * @param {string} params.sourceId - Source document ID
 * @param {string} params.title - Document title
 * @param {string} params.content - Document content
 * @returns {Promise<Entity[]>} Created/updated entities
 */
export async function processDocumentEntities({
  workspaceId,
  documentSourceId,
  sourceId,
  title,
  content,
}) {
  const startTime = Date.now();

  try {
    // Extract entities
    const { entities: extractedEntities, relationships } = await extractEntities(content, title);

    if (extractedEntities.length === 0) {
      logger.info('No entities extracted from document', {
        service: 'entity-extraction',
        sourceId,
      });
      return [];
    }

    // Create/update entities in database
    const entityMap = new Map(); // name -> Entity
    const savedEntities = [];

    for (const extracted of extractedEntities) {
      const entity = await Entity.findOrCreate(workspaceId, extracted.name, extracted.type, {
        description: extracted.description,
        aliases: extracted.aliases,
      });

      // Add document mention
      await entity.addDocumentMention(documentSourceId, sourceId, title, extracted.context);

      entityMap.set(extracted.name.toLowerCase(), entity);
      savedEntities.push(entity);
    }

    // Process relationships
    for (const rel of relationships) {
      const entity1 = entityMap.get(rel.entity1.toLowerCase());
      const entity2 = entityMap.get(rel.entity2.toLowerCase());

      if (entity1 && entity2) {
        await entity1.addRelationship(entity2._id, rel.type, 0.7, rel.evidence);
        // Add reverse relationship for bidirectional types
        if (['related_to', 'similar_to'].includes(rel.type)) {
          await entity2.addRelationship(entity1._id, rel.type, 0.7, rel.evidence);
        }
      }
    }

    logger.info('Processed document entities', {
      service: 'entity-extraction',
      sourceId,
      entitiesCount: savedEntities.length,
      relationshipsCount: relationships.length,
      processingTimeMs: Date.now() - startTime,
    });

    return savedEntities;
  } catch (error) {
    logger.error('Failed to process document entities', {
      service: 'entity-extraction',
      sourceId,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });

    throw error;
  }
}

/**
 * Extract entities from a conversation message
 * Lighter-weight extraction for real-time use
 *
 * @param {string} message - User message
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Entity[]>} Mentioned entities
 */
export async function extractMessageEntities(message, workspaceId) {
  try {
    // Search for existing entities mentioned in message

    const mentionedEntities = [];

    // Get all workspace entities for matching
    const allEntities = await Entity.find({ workspaceId }).select(
      'name normalizedName aliases type'
    );

    for (const entity of allEntities) {
      // Check if entity name appears in message
      if (message.toLowerCase().includes(entity.normalizedName)) {
        mentionedEntities.push(entity);
        continue;
      }

      // Check aliases
      for (const alias of entity.aliases || []) {
        if (message.toLowerCase().includes(alias.toLowerCase())) {
          mentionedEntities.push(entity);
          break;
        }
      }
    }

    // Update mention counts
    for (const entity of mentionedEntities) {
      await entity.mentionedInConversation();
    }

    return mentionedEntities;
  } catch (error) {
    logger.error('Failed to extract message entities', {
      service: 'entity-extraction',
      error: error.message,
    });
    return [];
  }
}

/**
 * Get entity context for RAG
 * Builds context string from relevant entities
 *
 * @param {Entity[]} entities - Entities to include
 * @returns {string} Formatted entity context
 */
export function buildEntityContext(entities) {
  if (!entities || entities.length === 0) {
    return '';
  }

  return `[Relevant Knowledge]
${entities
  .map((e) => {
    const desc = e.description ? `: ${e.description}` : '';
    const docs =
      e.documentSources?.length > 0
        ? ` (found in: ${e.documentSources
            .slice(0, 3)
            .map((d) => d.title)
            .join(', ')})`
        : '';
    return `- ${e.name} (${e.type})${desc}${docs}`;
  })
  .join('\n')}`;
}

/**
 * Get related entities for context enrichment
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string[]} entityNames - Entity names to find relations for
 * @param {Object} options - Query options
 * @returns {Promise<Entity[]>} Related entities
 */
export async function getRelatedEntities(workspaceId, entityNames, options = {}) {
  const { limit = 10 } = options;

  const entities = await Entity.find({
    workspaceId,
    normalizedName: { $in: entityNames.map((n) => n.toLowerCase()) },
  });

  const relatedIds = new Set();
  for (const entity of entities) {
    for (const rel of entity.relationships || []) {
      relatedIds.add(rel.entityId.toString());
    }
  }

  if (relatedIds.size === 0) {
    return [];
  }

  return Entity.find({
    _id: { $in: Array.from(relatedIds) },
  })
    .limit(limit)
    .select('name type description');
}
