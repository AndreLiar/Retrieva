---
sidebar_position: 4
---

# Semantic Chunking

The platform uses semantic-aware chunking to split documents intelligently, preserving context and structure for better retrieval.

## Why Semantic Chunking?

Traditional character-based chunking has problems:

| Issue | Character-Based | Semantic Chunking |
|-------|-----------------|-------------------|
| Context loss | Splits mid-sentence | Respects boundaries |
| Structure ignored | Lists split randomly | Lists stay together |
| No hierarchy | Flat chunks | Heading paths preserved |
| Size variance | Inconsistent | 200-400 token target |

## Chunking Pipeline

```
Notion Blocks (raw)
        │
        ▼
┌───────────────────┐
│  Block Flattening │ ◀─── Preserve parent context
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Semantic Grouping │ ◀─── Group by block type
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Token Merging    │ ◀─── Merge small groups
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Quality Filter   │ ◀─── Remove junk chunks
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Overlap Injection │ ◀─── Add context bridges
└────────┬──────────┘
         │
         ▼
LangChain Documents
```

## Phase 1: Block Flattening

Nested Notion blocks are flattened while preserving parent context:

```javascript
// services/notionTransformer.js

const flattenBlocks = (blocks, parentPath = []) => {
  const flattened = [];

  for (const block of blocks) {
    const blockWithContext = {
      ...block,
      _parentPath: [...parentPath],
    };

    flattened.push(blockWithContext);

    // Track heading hierarchy
    if (block.has_children && block.children) {
      const childPath = isHeading(block)
        ? [...parentPath, getBlockText(block)]
        : parentPath;
      flattened.push(...flattenBlocks(block.children, childPath));
    }
  }

  return flattened;
};
```

**Example:**

```
Input:
# Finance (heading_1)
  ## Invoices (heading_2)
    - Item 1 (bulleted_list_item)
    - Item 2 (bulleted_list_item)

Output:
[
  { type: 'heading_1', text: 'Finance', _parentPath: [] },
  { type: 'heading_2', text: 'Invoices', _parentPath: ['Finance'] },
  { type: 'bulleted_list_item', text: 'Item 1', _parentPath: ['Finance', 'Invoices'] },
  { type: 'bulleted_list_item', text: 'Item 2', _parentPath: ['Finance', 'Invoices'] },
]
```

## Phase 2: Semantic Grouping

Blocks are grouped based on semantic category:

### Block Categories

```javascript
const getBlockCategory = (block) => {
  const type = block.type;

  if (isHeading(block)) return 'heading';
  if (['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(type)) return 'list';
  if (type === 'toggle') return 'toggle';
  if (type === 'table_row') return 'table';
  if (type === 'callout') return 'callout';
  if (type === 'code') return 'code';
  if (type === 'quote') return 'quote';

  return 'paragraph';
};
```

### Grouping Rules

| Category | Rule | Max Size |
|----------|------|----------|
| `heading_group` | Heading + following paragraphs | 400 tokens |
| `list` | Consecutive list items (same type) | 15 items OR 400 tokens |
| `table` | Consecutive table rows | 400 tokens |
| `code` | Always standalone | Unlimited |
| `callout` | Always standalone | Unlimited |
| `toggle` | Toggle + children, standalone | Unlimited |
| `paragraph_group` | Consecutive paragraphs | 400 tokens (80% flush) |

### Grouping Algorithm

```javascript
const MAX_GROUP_TOKENS = 400;
const MAX_LIST_ITEMS = 15;
const FLUSH_THRESHOLD = Math.floor(MAX_GROUP_TOKENS * 0.8); // 320 tokens

export const groupBlocksSemantically = (blocks) => {
  const flatBlocks = flattenBlocks(blocks);
  const groups = [];
  let currentGroup = { blocks: [], category: null, headingPath: [] };

  for (const block of flatBlocks) {
    const category = getBlockCategory(block);
    const currentTokens = estimateTokens(transformBlocksToText(currentGroup.blocks));

    // Headings start new groups
    if (isHeading(block)) {
      flushGroup();
      currentGroup.category = 'heading_group';
      addBlockToGroup(block);
      continue;
    }

    // Lists: keep together up to limit
    if (category === 'list') {
      const listItemCount = currentGroup.blocks.filter(b =>
        ['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(b.type)
      ).length;

      if (currentGroup.category === 'list' &&
          currentTokens < MAX_GROUP_TOKENS &&
          listItemCount < MAX_LIST_ITEMS) {
        addBlockToGroup(block);
      } else {
        flushGroup();
        currentGroup.category = 'list';
        addBlockToGroup(block);
      }
      continue;
    }

    // Code/callout: always standalone
    if (category === 'code' || category === 'callout') {
      flushGroup();
      currentGroup.category = category;
      addBlockToGroup(block);
      flushGroup();
      continue;
    }

    // Paragraphs: flush at 80% capacity
    if (currentTokens >= FLUSH_THRESHOLD) {
      flushGroup();
    }
    addBlockToGroup(block);
  }

  flushGroup();
  return mergeSmallGroups(groups);
};
```

## Phase 3: Small Group Merging

Groups under 200 tokens are merged with predecessors sharing the same heading path:

```javascript
const MIN_GROUP_TOKENS = 200;

export const mergeSmallGroups = (groups) => {
  const merged = [];

  for (const group of groups) {
    // Skip merging for code and lists (intentional splits)
    if (group.tokens >= MIN_GROUP_TOKENS ||
        group.category === 'code' ||
        group.category === 'list') {
      merged.push(group);
      continue;
    }

    // Find predecessor with same heading path
    let target = null;
    for (let j = merged.length - 1; j >= 0; j--) {
      if (arraysEqual(merged[j].headingPath, group.headingPath)) {
        target = merged[j];
        break;
      }
    }

    if (target) {
      // Merge into target
      target.content = target.content + '\n\n' + group.content;
      target.tokens = estimateTokens(target.content);
    } else {
      merged.push(group);
    }
  }

  return merged;
};
```

## Phase 4: Quality Filtering

Junk chunks are filtered out:

```javascript
const JUNK_PATTERNS = [
  /^\[Table of Contents\]$/i,
  /^\[Breadcrumb\]$/i,
  /^---+$/,
  /^\[Link to page\]$/i,
  /^\s*$/,
  /^[-_=\s]+$/,
];

export const shouldIndexChunk = (group) => {
  const trimmed = (group.content || '').trim();

  if (trimmed.length < 20) return false;
  if ((group.tokens || 0) < 10) return false;

  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
};
```

## Phase 5: Overlap Injection

Trailing overlap bridges context between chunks:

```javascript
const OVERLAP_CHARS = 400; // ~100 tokens

for (let i = 1; i < processedGroups.length; i++) {
  const prevContent = processedGroups[i - 1].content;

  if (prevContent.length > 50) {
    let overlap = prevContent.substring(prevContent.length - OVERLAP_CHARS);

    // Prefer sentence boundary
    const sentenceBreak = overlap.indexOf('. ');
    if (sentenceBreak > 0 && sentenceBreak < overlap.length * 0.5) {
      overlap = overlap.substring(sentenceBreak + 2);
    }

    processedGroups[i].overlapBefore = overlap.trim();
  }
}
```

## Final Chunk Structure

Each chunk includes rich metadata:

```javascript
{
  pageContent: "[Finance > Invoices > Approval Rules]\n\n...content...",
  metadata: {
    // Page context
    workspaceId: "ws-123",
    sourceId: "page-456",
    documentTitle: "Finance Policy",
    documentUrl: "https://notion.so/...",

    // Semantic metadata
    block_type: "list",
    heading_path: ["Finance", "Invoices", "Approval Rules"],
    block_types_in_chunk: ["bulleted_list_item"],

    // Size info
    estimatedTokens: 285,
    blockCount: 12,
    chunkIndex: 3,
    totalChunks: 15,

    // Special flags
    is_code: false,
    is_table: false,
    is_list: true,
    code_language: null,

    // Overlap tracking
    has_overlap: true,
    overlap_chars: 95,
  }
}
```

## Token Estimation

Accurate token counting for size management:

```javascript
// utils/rag/tokenEstimation.js

export function estimateTokens(text, options = {}) {
  if (!text) return 0;

  // Language-aware heuristics
  const charsPerToken = detectLanguage(text) === 'cjk' ? 1.5 : 4.5;

  // Adjust for code (more special chars)
  if (options.isCode) {
    return Math.ceil(text.length / 3.0);
  }

  return Math.ceil(text.length / charsPerToken);
}
```

## Configuration

Environment variables for tuning:

```bash
# Chunk size targets
MAX_GROUP_TOKENS=400
MIN_GROUP_TOKENS=200
MAX_LIST_ITEMS=15

# Overlap
OVERLAP_CHARS=400

# Safety limits
MAX_CHUNK_TOKENS=800
MAX_CHUNK_CHARS=3600
```

## Metrics

Typical chunking results:

| Metric | Target | Typical |
|--------|--------|---------|
| Avg chunk size | 200-400 tokens | 285 tokens |
| Chunks needing split | &lt;10% | 5% |
| Junk chunks filtered | - | 8% |
| Chunks with heading path | >80% | 92% |
