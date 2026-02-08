/**
 * Concept Hierarchy Schema and Prompts
 *
 * Contains Mongoose schema and LLM prompts for concept hierarchy.
 * Extracted from conceptHierarchy.js for modularity.
 *
 * @module services/context/conceptHierarchySchema
 */

import mongoose from 'mongoose';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/ollama';

/**
 * Concept node schema
 */
const conceptNodeSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    normalizedName: {
      type: String,
      required: true,
      index: true,
    },
    level: {
      type: Number,
      default: 0,
    },

    // Hierarchy
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConceptNode',
      index: true,
    },
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConceptNode',
      },
    ],
    ancestors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConceptNode',
      },
    ],

    // Related concepts
    related: [
      {
        conceptId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ConceptNode',
        },
        relationship: String,
        strength: { type: Number, default: 0.5 },
      },
    ],

    // Linked entities
    entities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Entity',
      },
    ],

    // Metadata
    description: String,
    keywords: [String],
    documentCount: { type: Number, default: 0 },
    coverage: { type: Number, default: 0 },
    isLeaf: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Indexes (parent index is defined inline in schema)
conceptNodeSchema.index({ workspaceId: 1, normalizedName: 1 }, { unique: true });
conceptNodeSchema.index({ workspaceId: 1, level: 1 });

// Pre-save hook
conceptNodeSchema.pre('save', function (next) {
  this.normalizedName = this.name.toLowerCase().trim().replace(/\s+/g, '_');
  this.isLeaf = this.children.length === 0;
  next();
});

export const ConceptNode =
  mongoose.models.ConceptNode || mongoose.model('ConceptNode', conceptNodeSchema);

// Hierarchy LLM
export const hierarchyLlm = new ChatOllama({
  model: process.env.HIERARCHY_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.2,
  numPredict: 1500,
  format: 'json',
});

// Hierarchy building prompt
export const HIERARCHY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a knowledge organization expert. Build a concept hierarchy from the given topics and entities.

Rules:
1. Create a tree structure with broad categories at top, specific concepts at bottom
2. Max 4 levels deep
3. Each concept should have a clear parent (except root concepts)
4. Group similar concepts under common parents
5. Identify relationships between concepts

Respond with valid JSON:
{{
  "hierarchy": [
    {{
      "name": "Root Category",
      "level": 0,
      "children": [
        {{
          "name": "Subcategory",
          "level": 1,
          "children": [
            {{"name": "Specific Concept", "level": 2, "children": []}}
          ]
        }}
      ]
    }}
  ],
  "relationships": [
    {{"from": "concept1", "to": "concept2", "type": "similar|prerequisite|application"}}
  ]
}}`,
  ],
  [
    'user',
    `Domain: {domain}

Topics found in documents:
{topics}

Entity types and examples:
{entities}

Build a concept hierarchy for this knowledge base as JSON.`,
  ],
]);

// Concept lookup prompt
export const CONCEPT_LOOKUP_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Given a query and a concept hierarchy, identify which concepts are relevant.

Concept Hierarchy:
{hierarchy}

Respond with JSON:
{{
  "relevantConcepts": ["concept1", "concept2"],
  "primaryConcept": "most_relevant_concept",
  "conceptPath": ["root", "parent", "concept"],
  "confidence": 0.0-1.0
}}`,
  ],
  [
    'user',
    `Query: {query}

Which concepts are relevant?`,
  ],
]);

/**
 * Parse hierarchy LLM response
 */
export function parseHierarchyResponse(response) {
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
    return { hierarchy: [], relationships: [] };
  }
}

/**
 * Parse concept lookup response
 */
export function parseConceptLookupResponse(response) {
  try {
    const parsed = JSON.parse(response);
    return {
      relevantConcepts: parsed.relevantConcepts || [],
      primaryConcept: parsed.primaryConcept || null,
      conceptPath: parsed.conceptPath || [],
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  } catch {
    return {
      relevantConcepts: [],
      primaryConcept: null,
      conceptPath: [],
      confidence: 0.3,
    };
  }
}
