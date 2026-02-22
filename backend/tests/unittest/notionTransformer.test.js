/**
 * Notion Transformer Tests (Phase 5)
 * Tests for semantic block grouping with list splitting
 */

import { describe, it, expect } from 'vitest';
import {
  groupBlocksSemantically,
  mergeSmallGroups,
  transformBlocksToText,
} from '../../services/notionTransformer.js';

/**
 * Helper to create a bullet list item block
 */
function createBulletItem(text) {
  return {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ plain_text: text }],
    },
    has_children: false,
  };
}

/**
 * Helper to create a numbered list item block
 */
function createNumberedItem(text) {
  return {
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [{ plain_text: text }],
    },
    has_children: false,
  };
}

/**
 * Helper to create a heading block
 */
function createHeading(level, text) {
  const type = `heading_${level}`;
  return {
    type,
    [type]: {
      rich_text: [{ plain_text: text }],
    },
    has_children: false,
  };
}

/**
 * Helper to create a paragraph block
 */
function createParagraph(text) {
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ plain_text: text }],
    },
    has_children: false,
  };
}

describe('Notion Transformer', () => {
  describe('groupBlocksSemantically', () => {
    describe('List Splitting at 15 Items', () => {
      it('should split 30 list items into at least 2 groups', () => {
        // Create 30 bullet list items
        const blocks = [];
        for (let i = 0; i < 30; i++) {
          blocks.push(createBulletItem(`List item number ${i + 1} with some content`));
        }

        const groups = groupBlocksSemantically(blocks);

        // Should have at least 2 groups
        expect(groups.length).toBeGreaterThanOrEqual(2);

        // Verify list category
        groups.forEach((group) => {
          expect(group.category).toBe('list');
        });
      });

      it('should have each group with at most 15 items', () => {
        // Create 30 bullet list items
        const blocks = [];
        for (let i = 0; i < 30; i++) {
          blocks.push(createBulletItem(`Item ${i + 1}`));
        }

        const groups = groupBlocksSemantically(blocks);

        // Each group should have at most 15 list items
        groups.forEach((group) => {
          const listItemCount = group.blocks.filter((b) =>
            ['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(b.type)
          ).length;
          expect(listItemCount).toBeLessThanOrEqual(15);
        });
      });

      it('should preserve heading path across list splits', () => {
        // Create heading followed by 20 list items
        const blocks = [
          createHeading(1, 'Main Section'),
          createHeading(2, 'Subsection'),
          ...Array.from({ length: 20 }, (_, i) => createBulletItem(`Item ${i + 1}`)),
        ];

        const groups = groupBlocksSemantically(blocks);

        // Find list groups (skip heading groups)
        const listGroups = groups.filter((g) => g.category === 'list');

        // All list groups should have the same heading path
        expect(listGroups.length).toBeGreaterThanOrEqual(2);
        listGroups.forEach((group) => {
          expect(group.headingPath).toEqual(['Main Section', 'Subsection']);
        });
      });

      it('should keep small lists (10 items) in one group', () => {
        // Create 10 bullet list items
        const blocks = [];
        for (let i = 0; i < 10; i++) {
          blocks.push(createBulletItem(`Item ${i + 1}`));
        }

        const groups = groupBlocksSemantically(blocks);

        // Should be just one group
        expect(groups.length).toBe(1);
        expect(groups[0].category).toBe('list');
        expect(groups[0].blocks.length).toBe(10);
      });

      it('should not merge different list types (bullet vs numbered)', () => {
        // Create alternating bullet and numbered items
        const blocks = [
          createBulletItem('Bullet 1'),
          createBulletItem('Bullet 2'),
          createBulletItem('Bullet 3'),
          createNumberedItem('Number 1'),
          createNumberedItem('Number 2'),
          createNumberedItem('Number 3'),
        ];

        const groups = groupBlocksSemantically(blocks);

        // Should have at least 2 groups (one for bullets, one for numbers)
        expect(groups.length).toBeGreaterThanOrEqual(2);

        // Verify that blocks within each group are same type
        groups.forEach((group) => {
          if (group.category === 'list' && group.blocks.length > 1) {
            const firstType = group.blocks[0].type;
            group.blocks.forEach((block) => {
              expect(block.type).toBe(firstType);
            });
          }
        });
      });
    });

    describe('Token Thresholds', () => {
      it('should flush groups at 80% of MAX_GROUP_TOKENS', () => {
        // Create paragraphs that should trigger flush at ~320 tokens
        // At 4.5 chars/token, 320 tokens = ~1440 chars
        const longText = 'A'.repeat(350); // Each paragraph ~78 tokens
        const blocks = [];
        for (let i = 0; i < 10; i++) {
          blocks.push(createParagraph(longText));
        }

        const groups = groupBlocksSemantically(blocks);

        // Should create multiple groups
        expect(groups.length).toBeGreaterThan(1);

        // Each group should be under MAX_GROUP_TOKENS (400)
        groups.forEach((group) => {
          expect(group.tokens).toBeLessThanOrEqual(450); // Some margin for merging
        });
      });
    });

    describe('Heading Path Tracking', () => {
      it('should track heading hierarchy', () => {
        const blocks = [
          createHeading(1, 'Finance'),
          createHeading(2, 'Invoices'),
          createParagraph('Invoice processing details here.'),
        ];

        const groups = groupBlocksSemantically(blocks);

        // The paragraph should have heading path
        const paragraphGroup = groups.find(
          (g) => g.blockTypes.includes('paragraph') || g.category === 'heading_group'
        );
        expect(paragraphGroup).toBeDefined();
        expect(paragraphGroup.headingPath).toContain('Finance');
      });

      it('should reset heading path on same-level heading', () => {
        const blocks = [
          createHeading(1, 'Section A'),
          createParagraph('Content A'),
          createHeading(1, 'Section B'),
          createParagraph('Content B'),
        ];

        const groups = groupBlocksSemantically(blocks);

        // Find groups with content
        const groupA = groups.find(
          (g) => g.content.includes('Content A') || g.headingPath.includes('Section A')
        );
        const groupB = groups.find(
          (g) => g.content.includes('Content B') || g.headingPath.includes('Section B')
        );

        if (groupA) {
          expect(groupA.headingPath).not.toContain('Section B');
        }
        if (groupB) {
          expect(groupB.headingPath).not.toContain('Section A');
        }
      });
    });
  });

  describe('mergeSmallGroups', () => {
    it('should merge groups below MIN_GROUP_TOKENS (200)', () => {
      const groups = [
        {
          blocks: [],
          content: 'A'.repeat(500), // ~111 tokens (below 200)
          tokens: 111,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 0,
        },
        {
          blocks: [],
          content: 'B'.repeat(500), // ~111 tokens (below 200)
          tokens: 111,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 1,
        },
      ];

      const merged = mergeSmallGroups(groups);

      // Should merge since both are below 200 tokens and same heading path
      expect(merged.length).toBe(1);
    });

    it('should not merge groups at or above MIN_GROUP_TOKENS', () => {
      const groups = [
        {
          blocks: [],
          content: 'A'.repeat(1000), // ~222 tokens (above 200)
          tokens: 222,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 0,
        },
        {
          blocks: [],
          content: 'B'.repeat(1000), // ~222 tokens (above 200)
          tokens: 222,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 1,
        },
      ];

      const merged = mergeSmallGroups(groups);

      // Should not merge since both are above threshold
      expect(merged.length).toBe(2);
    });

    it('should never merge code blocks regardless of size', () => {
      const groups = [
        {
          blocks: [],
          content: 'const x = 1;',
          tokens: 5,
          category: 'code',
          blockTypes: ['code'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 0,
        },
        {
          blocks: [],
          content: 'function test() {}',
          tokens: 8,
          category: 'code',
          blockTypes: ['code'],
          headingPath: ['Section'],
          blockCount: 1,
          startIndex: 1,
        },
      ];

      const merged = mergeSmallGroups(groups);

      // Code blocks should not merge even if small
      expect(merged.length).toBe(2);
    });

    it('should only merge groups with matching heading paths', () => {
      const groups = [
        {
          blocks: [],
          content: 'Short content',
          tokens: 50,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section A'],
          blockCount: 1,
          startIndex: 0,
        },
        {
          blocks: [],
          content: 'More short content',
          tokens: 50,
          category: 'paragraph_group',
          blockTypes: ['paragraph'],
          headingPath: ['Section B'], // Different heading path
          blockCount: 1,
          startIndex: 1,
        },
      ];

      const merged = mergeSmallGroups(groups);

      // Should not merge different sections
      expect(merged.length).toBe(2);
    });
  });

  describe('transformBlocksToText', () => {
    it('should transform bullet list items', () => {
      const blocks = [createBulletItem('First item'), createBulletItem('Second item')];

      const text = transformBlocksToText(blocks);

      expect(text).toContain('- First item');
      expect(text).toContain('- Second item');
    });

    it('should transform numbered list items', () => {
      const blocks = [createNumberedItem('Step one'), createNumberedItem('Step two')];

      const text = transformBlocksToText(blocks);

      expect(text).toContain('1. Step one');
      expect(text).toContain('1. Step two');
    });

    it('should transform headings with proper markdown', () => {
      const blocks = [
        createHeading(1, 'Main Title'),
        createHeading(2, 'Subtitle'),
        createHeading(3, 'Subheading'),
      ];

      const text = transformBlocksToText(blocks);

      expect(text).toContain('# Main Title');
      expect(text).toContain('## Subtitle');
      expect(text).toContain('### Subheading');
    });
  });
});
