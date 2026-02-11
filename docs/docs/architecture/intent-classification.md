---
sidebar_position: 3
---

# Intent Classification

The intent classification system analyzes user queries to determine the optimal retrieval strategy. It uses a 3-tier cascade approach for efficiency and accuracy.

## Overview

```
User Query
     │
     ▼
┌─────────────────┐
│ Tier 1: Regex   │ ◀─── Fast pattern matching (~1ms)
│    Patterns     │
└────────┬────────┘
         │ No match
         ▼
┌─────────────────┐
│ Tier 2: Keyword │ ◀─── Scoring-based classification (~5ms)
│    Scoring      │
└────────┬────────┘
         │ Low confidence
         ▼
┌─────────────────┐
│ Tier 3: LLM     │ ◀─── GPT-4o-mini classification (~200ms)
│  Classification │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Intent + Config │
└─────────────────┘
```

## Intent Types

### 10 Supported Intents

| Intent | Description | Example Queries |
|--------|-------------|-----------------|
| `factual` | Direct fact lookup | "What is our refund policy?" |
| `comparison` | Compare items | "Compare plan A vs plan B" |
| `explanation` | Deep understanding | "Explain how authentication works" |
| `aggregation` | Summarize/list | "List all security policies" |
| `procedural` | Step-by-step | "How do I submit an expense?" |
| `clarification` | Ambiguous query | "What did you mean by that?" |
| `chitchat` | Social conversation | "Hello, how are you?" |
| `out_of_scope` | Unrelated | "What's the weather today?" |
| `opinion` | Subjective | "Is this a good approach?" |
| `temporal` | Time-based | "What changed last month?" |

## Tier 1: Regex Patterns

Fast pattern matching for common query structures:

```javascript
// services/intent/intentClassifier.js

const QUICK_PATTERNS = {
  COMPARISON: /\b(compare|versus|vs\.?|difference|similarities|better|worse|prefer)\b/i,

  PROCEDURAL: /\b(how (do|can|to|should|would)|steps|process|procedure|guide|tutorial)\b/i,

  AGGREGATION: /\b(all|every|list|summarize|overview|summary|complete|entire|full list)\b/i,

  EXPLANATION: /\b(explain|why|describe|elaborate|tell me about|what does .* mean)\b/i,

  TEMPORAL: /\b(when|recently|latest|last (week|month|year)|this (week|month)|updated|changed)\b/i,

  CHITCHAT: /^(hi|hello|hey|thanks|thank you|bye|goodbye|good morning|good afternoon)\b/i,

  OUT_OF_SCOPE: /\b(weather|stock|sports|news|joke|recipe|song|movie)\b/i,
};

function quickPatternMatch(query) {
  for (const [intent, pattern] of Object.entries(QUICK_PATTERNS)) {
    if (pattern.test(query)) {
      return {
        intent: IntentType[intent],
        confidence: 0.85,
        method: 'regex',
      };
    }
  }
  return null;
}
```

## Tier 2: Keyword Scoring

Weighted keyword analysis for more nuanced classification:

```javascript
const KEYWORD_SIGNALS = {
  FACTUAL: {
    positive: ['what is', 'define', 'meaning', 'who is', 'where is', 'which'],
    negative: ['compare', 'difference', 'explain why', 'how to'],
    weight: 1.0,
  },

  COMPARISON: {
    positive: ['versus', 'vs', 'compare', 'difference', 'better', 'prefer'],
    negative: ['what is', 'how to'],
    weight: 1.2,
  },

  EXPLANATION: {
    positive: ['explain', 'why', 'reason', 'how does', 'describe', 'elaborate'],
    negative: ['list', 'compare'],
    weight: 1.1,
  },

  AGGREGATION: {
    positive: ['all', 'list', 'every', 'summarize', 'overview', 'complete'],
    negative: ['specific', 'one', 'single'],
    weight: 1.0,
  },

  PROCEDURAL: {
    positive: ['how to', 'steps', 'process', 'guide', 'procedure', 'tutorial'],
    negative: ['why', 'what is'],
    weight: 1.1,
  },
};

function scoreKeywords(query) {
  const scores = {};
  const queryLower = query.toLowerCase();

  for (const [intent, signals] of Object.entries(KEYWORD_SIGNALS)) {
    let score = 0;

    // Add points for positive keywords
    for (const keyword of signals.positive) {
      if (queryLower.includes(keyword)) {
        score += signals.weight;
      }
    }

    // Subtract for negative keywords
    for (const keyword of signals.negative) {
      if (queryLower.includes(keyword)) {
        score -= signals.weight * 0.5;
      }
    }

    scores[intent] = score;
  }

  // Return highest scoring intent
  const [topIntent, topScore] = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)[0];

  if (topScore > 0.5) {
    return {
      intent: IntentType[topIntent],
      confidence: Math.min(0.8, 0.5 + topScore * 0.1),
      method: 'keyword',
    };
  }

  return null;
}
```

## Tier 3: LLM Classification

For ambiguous queries, GPT-4o-mini provides accurate classification:

```javascript
const CLASSIFICATION_PROMPT = `Classify the user's query intent.

Available intents:
- factual: Direct fact lookup
- comparison: Comparing items or concepts
- explanation: Understanding why/how something works
- aggregation: Listing or summarizing multiple items
- procedural: Step-by-step instructions
- clarification: Needs more context
- chitchat: Social conversation
- out_of_scope: Unrelated to documents
- opinion: Subjective question
- temporal: Time-based query

Query: {query}

Respond with JSON:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

async function classifyWithLLM(query) {
  const response = await llm.invoke(CLASSIFICATION_PROMPT.replace('{query}', query));
  return JSON.parse(response);
}
```

## Intent Characteristics

Each intent maps to retrieval configuration:

```javascript
const IntentCharacteristics = {
  [IntentType.FACTUAL]: {
    retrievalStrategy: 'focused',
    topK: 5,
    requiresRetrieval: true,
    responsePrompt: 'Provide a direct, factual answer with citations.',
  },

  [IntentType.COMPARISON]: {
    retrievalStrategy: 'multi-aspect',
    topK: 10,
    requiresRetrieval: true,
    responsePrompt: 'Compare the items objectively, citing sources for each point.',
  },

  [IntentType.EXPLANATION]: {
    retrievalStrategy: 'deep',
    topK: 8,
    requiresRetrieval: true,
    responsePrompt: 'Provide a comprehensive explanation with examples.',
  },

  [IntentType.AGGREGATION]: {
    retrievalStrategy: 'broad',
    topK: 15,
    requiresRetrieval: true,
    responsePrompt: 'Provide a comprehensive list or summary.',
  },

  [IntentType.PROCEDURAL]: {
    retrievalStrategy: 'focused',
    topK: 6,
    requiresRetrieval: true,
    responsePrompt: 'Provide step-by-step instructions.',
  },

  [IntentType.CHITCHAT]: {
    retrievalStrategy: 'no-retrieval',
    topK: 0,
    requiresRetrieval: false,
    responsePrompt: null,
  },

  [IntentType.OUT_OF_SCOPE]: {
    retrievalStrategy: 'no-retrieval',
    topK: 0,
    requiresRetrieval: false,
    responsePrompt: null,
  },
};
```

## Retrieval Strategies

### focused

For precise, single-fact queries:
- Low k (5-6 documents)
- High similarity threshold
- Single-source preference

### multi-aspect

For comparison queries:
- Medium k (10 documents)
- Multiple query variants
- Diverse source selection

### deep

For explanation queries:
- Medium-high k (8 documents)
- Related concept expansion
- Comprehensive coverage

### broad

For aggregation queries:
- High k (15 documents)
- Wide coverage
- Deduplication focus

### context-only

For clarification:
- Uses conversation history only
- No new retrieval
- Rephrasing assistance

### no-retrieval

For chitchat/out-of-scope:
- Skip retrieval entirely
- Predefined responses
- Fast response time

## Query Router

The query router orchestrates the classification:

```javascript
// services/intent/queryRouter.js

export const queryRouter = {
  async route(query, options = {}) {
    // Try quick patterns first
    let result = quickPatternMatch(query);

    if (result && result.confidence >= 0.8) {
      return this.buildRouting(result);
    }

    // Try keyword scoring
    result = scoreKeywords(query);

    if (result && result.confidence >= 0.7) {
      return this.buildRouting(result);
    }

    // Fall back to LLM classification
    result = await classifyWithLLM(query);

    return this.buildRouting(result);
  },

  buildRouting(classification) {
    const config = IntentCharacteristics[classification.intent];

    return {
      intent: classification.intent,
      confidence: classification.confidence,
      strategy: config.retrievalStrategy,
      config: {
        topK: config.topK,
        responsePrompt: config.responsePrompt,
      },
      skipRAG: !config.requiresRetrieval,
    };
  },
};
```

## Usage in RAG Service

```javascript
// services/rag.js

async askWithConversation(question, options = {}) {
  // Route the query
  const routing = await queryRouter.route(question, {
    conversationHistory: messages,
  });

  logger.info('Query routed', {
    intent: routing.intent,
    confidence: routing.confidence,
    strategy: routing.strategy,
  });

  // Handle non-RAG intents
  if (routing.skipRAG) {
    return this._handleNonRAGIntent(question, routing);
  }

  // Execute retrieval with strategy
  const retrieval = await executeStrategy(
    routing.strategy,
    searchQuery,
    this.retriever,
    this.vectorStore,
    routing.config
  );

  // Continue with generation...
}
```

## Performance

| Tier | Latency | Accuracy | Use Case |
|------|---------|----------|----------|
| Regex | ~1ms | 85% | Common patterns |
| Keywords | ~5ms | 75% | Nuanced queries |
| LLM | ~200ms | 95% | Ambiguous queries |

The cascade approach ensures most queries are classified quickly while maintaining high accuracy for complex cases.
