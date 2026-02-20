/**
 * Notion Block to Text/Markdown Transformer
 * Converts all Notion block types to searchable text while preserving structure
 */

import { sha256 } from '../utils/security/crypto.js';
import { estimateTokens } from '../utils/rag/tokenEstimation.js';

/**
 * Extract plain text from rich text array
 * @param {Array} richTextArray - Notion rich text array
 * @returns {string} Plain text
 */
const extractPlainText = (richTextArray) => {
  if (!richTextArray || !Array.isArray(richTextArray)) {
    return '';
  }
  return richTextArray.map((item) => item.plain_text || item.text?.content || '').join('');
};

/**
 * Transform a single Notion block to markdown text
 * @param {Object} block - Notion block object
 * @param {number} indentLevel - Current indentation level
 * @returns {string} Markdown text
 */
const transformBlock = (block, indentLevel = 0) => {
  const indent = '  '.repeat(indentLevel);
  const type = block.type;
  const blockData = block[type];

  if (!blockData) {
    return '';
  }

  switch (type) {
    case 'paragraph': {
      const paragraphText = extractPlainText(blockData.rich_text);
      return paragraphText ? `${indent}${paragraphText}\n\n` : '';
    }

    case 'heading_1': {
      const h1Text = extractPlainText(blockData.rich_text);
      return h1Text ? `${indent}# ${h1Text}\n\n` : '';
    }

    case 'heading_2': {
      const h2Text = extractPlainText(blockData.rich_text);
      return h2Text ? `${indent}## ${h2Text}\n\n` : '';
    }

    case 'heading_3': {
      const h3Text = extractPlainText(blockData.rich_text);
      return h3Text ? `${indent}### ${h3Text}\n\n` : '';
    }

    case 'bulleted_list_item': {
      const bulletText = extractPlainText(blockData.rich_text);
      return bulletText ? `${indent}- ${bulletText}\n` : '';
    }

    case 'numbered_list_item': {
      const numberedText = extractPlainText(blockData.rich_text);
      return numberedText ? `${indent}1. ${numberedText}\n` : '';
    }

    case 'to_do': {
      const todoText = extractPlainText(blockData.rich_text);
      const checked = blockData.checked ? 'x' : ' ';
      return todoText ? `${indent}- [${checked}] ${todoText}\n` : '';
    }

    case 'toggle': {
      const toggleText = extractPlainText(blockData.rich_text);
      return toggleText ? `${indent}▸ ${toggleText}\n` : '';
    }

    case 'quote': {
      const quoteText = extractPlainText(blockData.rich_text);
      return quoteText ? `${indent}> ${quoteText}\n\n` : '';
    }

    case 'callout': {
      const calloutText = extractPlainText(blockData.rich_text);
      const icon = blockData.icon?.emoji || '💡';
      return calloutText ? `${indent}${icon} ${calloutText}\n\n` : '';
    }

    case 'code': {
      const codeText = extractPlainText(blockData.rich_text);
      const language = blockData.language || '';
      return codeText ? `${indent}\`\`\`${language}\n${codeText}\n\`\`\`\n\n` : '';
    }

    case 'divider':
      return `${indent}---\n\n`;

    case 'table_row': {
      const cells = blockData.cells || [];
      const cellTexts = cells.map((cell) => extractPlainText(cell));
      return `${indent}| ${cellTexts.join(' | ')} |\n`;
    }

    case 'child_page': {
      const childPageTitle = block.child_page?.title || 'Untitled';
      return `${indent}📄 ${childPageTitle}\n\n`;
    }

    case 'child_database': {
      const childDbTitle = block.child_database?.title || 'Untitled Database';
      return `${indent}🗂️ ${childDbTitle}\n\n`;
    }

    case 'embed':
    case 'bookmark': {
      const url = blockData.url || '';
      return url ? `${indent}🔗 ${url}\n\n` : '';
    }

    case 'image':
    case 'video':
    case 'file':
    case 'pdf': {
      const caption = extractPlainText(blockData.caption || []);
      const fileUrl = blockData.external?.url || blockData.file?.url || '';
      return caption ? `${indent}[${type}: ${caption}]\n` : fileUrl ? `${indent}[${type}]\n` : '';
    }

    case 'equation': {
      const equation = blockData.expression || '';
      return equation ? `${indent}$$${equation}$$\n\n` : '';
    }

    case 'table_of_contents':
      return `${indent}[Table of Contents]\n\n`;

    case 'breadcrumb':
      return `${indent}[Breadcrumb]\n`;

    case 'column_list':
    case 'column':
      // Columns are handled by their children
      return '';

    case 'link_preview': {
      const previewUrl = blockData.url || '';
      return previewUrl ? `${indent}🔗 ${previewUrl}\n\n` : '';
    }

    case 'synced_block':
      // Synced blocks contain children
      return '';

    case 'template': {
      const templateText = extractPlainText(blockData.rich_text);
      return templateText ? `${indent}Template: ${templateText}\n\n` : '';
    }

    case 'link_to_page':
      return `${indent}[Link to page]\n`;

    default:
      // Unknown block type - try to extract any rich_text
      if (blockData.rich_text) {
        const unknownText = extractPlainText(blockData.rich_text);
        return unknownText ? `${indent}${unknownText}\n` : '';
      }
      return '';
  }
};

/**
 * Transform array of Notion blocks to markdown text
 * @param {Array} blocks - Array of Notion block objects
 * @param {number} indentLevel - Current indentation level
 * @returns {string} Markdown text
 */
export const transformBlocksToText = (blocks, indentLevel = 0) => {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return '';
  }

  let text = '';

  for (const block of blocks) {
    // Transform current block
    text += transformBlock(block, indentLevel);

    // Recursively transform children if they exist
    if (block.has_children && block.children && block.children.length > 0) {
      text += transformBlocksToText(block.children, indentLevel + 1);
    }
  }

  return text;
};

/**
 * Extract metadata from Notion page properties
 * @param {Object} properties - Notion page properties
 * @returns {Object} Extracted metadata
 */
export const extractPageMetadata = (properties) => {
  const metadata = {};

  for (const [key, value] of Object.entries(properties)) {
    const type = value.type;

    switch (type) {
      case 'title':
        metadata[key] = extractPlainText(value.title);
        break;
      case 'rich_text':
        metadata[key] = extractPlainText(value.rich_text);
        break;
      case 'number':
        metadata[key] = value.number;
        break;
      case 'select':
        metadata[key] = value.select?.name;
        break;
      case 'multi_select':
        metadata[key] = value.multi_select?.map((item) => item.name) || [];
        break;
      case 'date':
        metadata[key] = value.date?.start;
        break;
      case 'checkbox':
        metadata[key] = value.checkbox;
        break;
      case 'url':
        metadata[key] = value.url;
        break;
      case 'email':
        metadata[key] = value.email;
        break;
      case 'phone_number':
        metadata[key] = value.phone_number;
        break;
      case 'status':
        metadata[key] = value.status?.name;
        break;
      default:
        // Skip complex types like people, files, relation, rollup, formula
        break;
    }
  }

  return metadata;
};

/**
 * Calculate content hash for change detection
 * @param {string} content - Document content
 * @returns {string} SHA-256 hash of content
 */
export const calculateContentHash = (content) => {
  return sha256(content);
};

/**
 * SEMANTIC CHUNKING ENHANCEMENTS
 * Phase 1 & 2: Block-aware grouping and heading path tracking
 */

/**
 * Get plain text content from a block
 * @param {Object} block - Notion block object
 * @returns {string} Plain text content
 */
const getBlockText = (block) => {
  const type = block.type;
  const blockData = block[type];

  if (!blockData) return '';

  // Handle rich text blocks
  if (blockData.rich_text) {
    return extractPlainText(blockData.rich_text);
  }

  // Handle special cases
  switch (type) {
    case 'table_row': {
      const cells = blockData.cells || [];
      return cells.map((cell) => extractPlainText(cell)).join(' | ');
    }
    case 'child_page':
      return block.child_page?.title || '';
    case 'child_database':
      return block.child_database?.title || '';
    default:
      return '';
  }
};

/**
 * Check if block is a heading
 * @param {Object} block - Notion block
 * @returns {boolean}
 */
const isHeading = (block) => {
  return ['heading_1', 'heading_2', 'heading_3'].includes(block.type);
};

/**
 * Get heading level (1, 2, or 3)
 * @param {Object} block - Notion block
 * @returns {number|null} Heading level or null
 */
const getHeadingLevel = (block) => {
  if (block.type === 'heading_1') return 1;
  if (block.type === 'heading_2') return 2;
  if (block.type === 'heading_3') return 3;
  return null;
};

/**
 * Determine block category for semantic grouping
 * @param {Object} block - Notion block
 * @returns {string} Block category
 */
const getBlockCategory = (block) => {
  const type = block.type;

  // Headings
  if (isHeading(block)) return 'heading';

  // Lists (should be grouped together)
  if (['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(type)) {
    return 'list';
  }

  // Toggles (heading + content)
  if (type === 'toggle') return 'toggle';

  // Tables (group consecutive rows)
  if (type === 'table_row') return 'table';

  // Callouts (standalone)
  if (type === 'callout') return 'callout';

  // Code blocks (standalone)
  if (type === 'code') return 'code';

  // Quotes (can be grouped)
  if (type === 'quote') return 'quote';

  // Default: paragraph-like content
  return 'paragraph';
};

// Token estimation is now imported from utils/rag/tokenEstimation.js

/**
 * Flatten nested blocks into a single array
 * @param {Array} blocks - Notion blocks
 * @returns {Array} Flattened blocks with parent context
 */
const flattenBlocks = (blocks, parentPath = []) => {
  const flattened = [];

  for (const block of blocks) {
    const blockWithContext = {
      ...block,
      _parentPath: [...parentPath],
    };

    flattened.push(blockWithContext);

    // Recursively flatten children
    if (block.has_children && block.children && block.children.length > 0) {
      const childPath = isHeading(block) ? [...parentPath, getBlockText(block)] : parentPath;
      flattened.push(...flattenBlocks(block.children, childPath));
    }
  }

  return flattened;
};

/**
 * Group blocks semantically for optimal chunking
 * Phase 1: Semantic Block Grouping
 *
 * Grouping rules:
 * 1. Heading + following paragraphs → one group
 * 2. Consecutive list items → one group
 * 3. Toggle + children → one group
 * 4. Callout → standalone group
 * 5. Code block → standalone group
 * 6. Consecutive table rows → one group
 *
 * Target: 200-400 tokens per group (configurable via MAX_GROUP_TOKENS)
 *
 * @param {Array} blocks - Array of Notion blocks
 * @returns {Array} Array of block groups
 */
const MAX_GROUP_TOKENS = parseInt(process.env.MAX_GROUP_TOKENS) || 400;
const MIN_GROUP_TOKENS = parseInt(process.env.MIN_GROUP_TOKENS) || 200;
const MAX_LIST_ITEMS = parseInt(process.env.MAX_LIST_ITEMS) || 15;
const FLUSH_THRESHOLD = Math.floor(MAX_GROUP_TOKENS * 0.8); // 320 tokens at default

export const groupBlocksSemantically = (blocks) => {
  const flatBlocks = flattenBlocks(blocks);
  const groups = [];

  let currentGroup = {
    blocks: [],
    category: null,
    headingPath: [],
    startIndex: 0,
    blockTypes: new Set(),
    codeLanguage: null,
  };

  // Track heading hierarchy for breadcrumbs (Phase 2)
  const headingStack = []; // [{level: 1, text: "Finance"}, {level: 2, text: "Invoices"}]

  const flushGroup = () => {
    if (currentGroup.blocks.length > 0) {
      const markdown = transformBlocksToText(currentGroup.blocks).trim();
      const tokens = estimateTokens(markdown);

      // Only create group if it has meaningful content
      if (markdown.length > 20) {
        groups.push({
          blocks: currentGroup.blocks,
          content: markdown,
          tokens,
          category: currentGroup.category,
          blockTypes: Array.from(currentGroup.blockTypes),
          headingPath: [...currentGroup.headingPath],
          blockCount: currentGroup.blocks.length,
          startIndex: currentGroup.startIndex,
          codeLanguage: currentGroup.codeLanguage,
        });
      }
    }

    currentGroup = {
      blocks: [],
      category: null,
      headingPath: [...headingStack.map((h) => h.text)],
      startIndex: 0,
      blockTypes: new Set(),
      codeLanguage: null,
    };
  };

  const addBlockToGroup = (block, index) => {
    if (currentGroup.blocks.length === 0) {
      currentGroup.startIndex = index;
    }
    currentGroup.blocks.push(block);
    currentGroup.blockTypes.add(block.type);

    // Track code language if it's a code block
    if (block.type === 'code' && block.code?.language) {
      currentGroup.codeLanguage = block.code.language;
    }
  };

  // Process blocks sequentially
  for (let i = 0; i < flatBlocks.length; i++) {
    const block = flatBlocks[i];
    const category = getBlockCategory(block);
    const currentContent = transformBlocksToText(currentGroup.blocks);
    const currentTokens = estimateTokens(currentContent);

    // Phase 2: Update heading stack for breadcrumb tracking
    if (isHeading(block)) {
      const level = getHeadingLevel(block);
      const text = getBlockText(block);

      // Pop headings of same or lower level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      // Push new heading
      if (text.trim()) {
        headingStack.push({ level, text: text.trim() });
      }

      // Flush previous group before starting new section
      if (currentGroup.blocks.length > 0) {
        flushGroup();
      }

      // Start new group with heading
      currentGroup.category = 'heading_group';
      addBlockToGroup(block, i);
      continue;
    }

    // If we have a heading group, add content until MAX_GROUP_TOKENS
    if (currentGroup.category === 'heading_group' && currentTokens < MAX_GROUP_TOKENS) {
      // Keep adding paragraphs, quotes to heading group
      if (['paragraph', 'quote'].includes(category)) {
        addBlockToGroup(block, i);
        continue;
      }
    }

    // List grouping: keep consecutive list items together, max MAX_LIST_ITEMS items
    if (category === 'list') {
      const currentListItemCount = currentGroup.blocks.filter((b) =>
        ['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(b.type)
      ).length;

      // Check if adding this item would exceed limits
      const wouldExceedItemLimit = currentListItemCount >= MAX_LIST_ITEMS;
      const wouldExceedTokenLimit = currentTokens >= MAX_GROUP_TOKENS;

      // Check list type consistency (don't merge bullets with numbered)
      const lastBlock = currentGroup.blocks[currentGroup.blocks.length - 1];
      const sameListType = !lastBlock || lastBlock.type === block.type;

      // Check if we can continue the current list
      const canContinueList =
        currentGroup.category === 'list' &&
        !wouldExceedTokenLimit &&
        !wouldExceedItemLimit &&
        sameListType;

      if (canContinueList) {
        addBlockToGroup(block, i);
      } else {
        flushGroup();
        currentGroup.category = 'list';
        addBlockToGroup(block, i);
      }
      continue;
    }

    // Table grouping: keep consecutive table rows together
    if (category === 'table') {
      if (currentGroup.category === 'table' && currentTokens < MAX_GROUP_TOKENS) {
        addBlockToGroup(block, i);
      } else {
        flushGroup();
        currentGroup.category = 'table';
        addBlockToGroup(block, i);
      }
      continue;
    }

    // Toggle: standalone with children
    if (category === 'toggle') {
      flushGroup();
      currentGroup.category = 'toggle';
      addBlockToGroup(block, i);
      flushGroup(); // Immediately flush
      continue;
    }

    // Code: standalone
    if (category === 'code') {
      flushGroup();
      currentGroup.category = 'code';
      addBlockToGroup(block, i);
      flushGroup(); // Immediately flush
      continue;
    }

    // Callout: standalone
    if (category === 'callout') {
      flushGroup();
      currentGroup.category = 'callout';
      addBlockToGroup(block, i);
      flushGroup(); // Immediately flush
      continue;
    }

    // Default: paragraph-like content
    // Use 80% threshold to avoid oversized groups
    if (currentTokens >= FLUSH_THRESHOLD) {
      flushGroup();
    }

    if (currentGroup.category === null) {
      currentGroup.category = 'paragraph_group';
    }
    addBlockToGroup(block, i);
  }

  // Flush final group
  flushGroup();

  // Merge tiny groups into their nearest same-headingPath predecessor
  return mergeSmallGroups(groups);
};

/**
 * Check deep equality of two arrays (used for headingPath comparison)
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean}
 */
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const _MIN_STANDALONE_TOKENS = parseInt(process.env.MIN_STANDALONE_TOKENS) || 50;

/**
 * Merge small groups (< MIN_GROUP_TOKENS) into their nearest
 * previous group with the same full headingPath.
 * Code blocks are exempt — even small code has retrieval value.
 *
 * Phase 5: Changed threshold from MIN_STANDALONE_TOKENS (50) to MIN_GROUP_TOKENS (200)
 * to reduce chunk variance and ensure chunks are in 200-400 token range.
 *
 * @param {Array} groups - Semantic groups from groupBlocksSemantically
 * @returns {Array} Groups with tiny chunks merged
 */
export const mergeSmallGroups = (groups) => {
  const merged = [];
  let mergeCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    // Skip merging for code blocks, list groups, or groups above threshold
    // Phase 5: Use MIN_GROUP_TOKENS (200) instead of MIN_STANDALONE_TOKENS (50)
    // List groups are not merged to preserve intentional splits at MAX_LIST_ITEMS
    if (
      group.tokens >= MIN_GROUP_TOKENS ||
      group.category === 'code' ||
      group.category === 'code_split' ||
      group.category === 'list' ||
      group.category === 'list_split'
    ) {
      merged.push(group);
      continue;
    }

    // Find nearest previous group with same full headingPath
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
      target.blocks = [...(target.blocks || []), ...(group.blocks || [])];
      target.blockCount = (target.blocks || []).length;

      // Merge blockTypes
      const mergedTypes = new Set([...target.blockTypes, ...group.blockTypes]);
      target.blockTypes = Array.from(mergedTypes);

      mergeCount++;
    } else {
      // No suitable target — keep as-is
      merged.push(group);
    }
  }

  if (mergeCount > 0) {
    // Log is done at the call-site level (notionDocumentLoader), but we
    // attach the count so the caller can read it.
    merged._mergeCount = mergeCount;
  }

  return merged;
};

export default {
  transformBlocksToText,
  extractPageMetadata,
  calculateContentHash,
  groupBlocksSemantically,
  mergeSmallGroups,
};
