import mongoose from 'mongoose';

/**
 * Entity Model
 *
 * M3 COMPRESSED MEMORY: Stores extracted entities and their relationships
 * - People, organizations, concepts, dates, locations
 * - Cross-document entity linking
 * - Relationship tracking between entities
 */

const entitySchema = new mongoose.Schema(
  {
    // Workspace scope
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },

    // Entity identification
    name: {
      type: String,
      required: true,
    },
    normalizedName: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'person',
        'organization',
        'concept',
        'date',
        'location',
        'product',
        'event',
        'technology',
        'other',
      ],
      required: true,
      index: true,
    },

    // Entity description/definition
    description: {
      type: String,
    },

    // Aliases (different ways to refer to this entity)
    aliases: [
      {
        type: String,
      },
    ],

    // Source documents where this entity appears
    documentSources: [
      {
        documentSourceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'DocumentSource',
        },
        sourceId: String,
        title: String,
        mentionCount: { type: Number, default: 1 },
        contexts: [String], // Snippets where entity appears
      },
    ],

    // Relationships to other entities
    relationships: [
      {
        entityId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Entity',
        },
        type: {
          type: String,
          enum: [
            'related_to',
            'part_of',
            'works_at',
            'created_by',
            'located_in',
            'owns',
            'manages',
            'depends_on',
            'similar_to',
          ],
        },
        strength: { type: Number, min: 0, max: 1, default: 0.5 },
        evidence: String, // Context that supports this relationship
      },
    ],

    // Attributes/properties
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },

    // Usage statistics
    stats: {
      totalMentions: { type: Number, default: 0 },
      documentCount: { type: Number, default: 0 },
      lastMentionedAt: Date,
      conversationMentions: { type: Number, default: 0 },
    },

    // Entity embedding for semantic similarity
    embedding: {
      type: [Number],
      default: [],
    },

    // Confidence in entity extraction
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.8,
    },

    // Processing metadata
    extractedBy: {
      type: String,
      default: 'mistral:latest',
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
entitySchema.index({ workspaceId: 1, normalizedName: 1, type: 1 }, { unique: true });
entitySchema.index({ workspaceId: 1, type: 1 });
entitySchema.index({ 'documentSources.sourceId': 1 });
entitySchema.index({ 'stats.totalMentions': -1 });
entitySchema.index({ aliases: 1 });

/**
 * Pre-save hook to normalize entity name
 */
entitySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.normalizedName = this.name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
  next();
});

/**
 * Static method to find or create entity
 */
entitySchema.statics.findOrCreate = async function (workspaceId, name, type, data = {}) {
  const normalizedName = name.toLowerCase().trim().replace(/\s+/g, ' ');

  let entity = await this.findOne({ workspaceId, normalizedName, type });

  if (!entity) {
    entity = new this({
      workspaceId,
      name,
      normalizedName,
      type,
      ...data,
    });
    await entity.save();
  }

  return entity;
};

/**
 * Static method to find entities by type
 */
entitySchema.statics.findByType = function (workspaceId, type, options = {}) {
  const { limit = 50, minMentions = 1 } = options;
  return this.find({
    workspaceId,
    type,
    'stats.totalMentions': { $gte: minMentions },
  })
    .sort({ 'stats.totalMentions': -1 })
    .limit(limit);
};

/**
 * Static method to search entities by name
 */
entitySchema.statics.searchByName = function (workspaceId, query, options = {}) {
  const { limit = 20, types = null } = options;
  const filter = {
    workspaceId,
    $or: [
      { normalizedName: { $regex: new RegExp(query, 'i') } },
      { aliases: { $regex: new RegExp(query, 'i') } },
    ],
  };
  if (types && types.length > 0) {
    filter.type = { $in: types };
  }
  return this.find(filter).limit(limit);
};

/**
 * Static method to get related entities
 */
entitySchema.statics.getRelated = function (entityId, options = {}) {
  const { limit = 10 } = options;
  return this.findById(entityId)
    .populate({
      path: 'relationships.entityId',
      select: 'name type description stats',
    })
    .then((entity) => {
      if (!entity) return [];
      return entity.relationships.sort((a, b) => b.strength - a.strength).slice(0, limit);
    });
};

/**
 * Add document mention to entity
 */
entitySchema.methods.addDocumentMention = function (documentSourceId, sourceId, title, context) {
  const existing = this.documentSources.find((d) => d.sourceId === sourceId);

  if (existing) {
    existing.mentionCount += 1;
    if (context && !existing.contexts.includes(context)) {
      existing.contexts.push(context);
      // Keep only last 5 contexts
      if (existing.contexts.length > 5) {
        existing.contexts = existing.contexts.slice(-5);
      }
    }
  } else {
    this.documentSources.push({
      documentSourceId,
      sourceId,
      title,
      mentionCount: 1,
      contexts: context ? [context] : [],
    });
  }

  this.stats.totalMentions += 1;
  this.stats.documentCount = this.documentSources.length;
  this.stats.lastMentionedAt = new Date();

  return this.save();
};

/**
 * Add relationship to another entity
 */
entitySchema.methods.addRelationship = function (entityId, type, strength = 0.5, evidence = '') {
  const existing = this.relationships.find(
    (r) => r.entityId.toString() === entityId.toString() && r.type === type
  );

  if (existing) {
    // Strengthen existing relationship
    existing.strength = Math.min(1, existing.strength + 0.1);
    if (evidence) existing.evidence = evidence;
  } else {
    this.relationships.push({ entityId, type, strength, evidence });
  }

  return this.save();
};

/**
 * Increment conversation mention count
 */
entitySchema.methods.mentionedInConversation = function () {
  this.stats.conversationMentions += 1;
  this.stats.lastMentionedAt = new Date();
  return this.save();
};

export const Entity = mongoose.model('Entity', entitySchema);
