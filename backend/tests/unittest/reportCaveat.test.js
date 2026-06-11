import { describe, it, expect } from 'vitest';
import { partialEvidenceCaveat } from '../../services/reportGenerator.js';

/**
 * #395 — the generated report flags a "reduced confidence" caveat when an
 * assessment was run on a partial document set. With per-file category tagging
 * it lists the SPECIFIC missing categories; without tags it falls back to a
 * count-based caveat.
 */
describe('reportGenerator — partial-evidence caveat (#395)', () => {
  describe('precise mode (tagged documents)', () => {
    it('lists the specific missing recommended categories (DORA)', () => {
      const caveat = partialEvidenceCaveat({
        framework: 'DORA',
        documents: [{ category: 'iso27001' }, { category: 'soc2' }],
      });
      expect(caveat).toContain('missing recommended evidence');
      // present categories are NOT listed
      expect(caveat).not.toContain('ISO 27001');
      expect(caveat).not.toContain('SOC 2');
      // missing ones ARE listed
      expect(caveat).toContain('a security policy');
      expect(caveat).toContain('a business continuity / DR plan');
      expect(caveat).toContain('a data processing agreement (GDPR)');
    });

    it('lists missing Art.30 annexes when only the contract is tagged', () => {
      const caveat = partialEvidenceCaveat({
        framework: 'CONTRACT_A30',
        documents: [{ category: 'contract' }],
      });
      expect(caveat).toContain('an SLA annex');
      expect(caveat).toContain('a subcontractor list');
      expect(caveat).not.toContain('the ICT services contract'); // present
    });

    it('returns null when every recommended category is covered', () => {
      const caveat = partialEvidenceCaveat({
        framework: 'DORA',
        documents: [
          { category: 'iso27001' },
          { category: 'soc2' },
          { category: 'securityPolicy' },
          { category: 'bcp' },
          { category: 'dpa' },
        ],
      });
      expect(caveat).toBeNull();
    });

    it('treats "other"-tagged documents as not covering any recommended category', () => {
      const caveat = partialEvidenceCaveat({
        framework: 'DORA',
        documents: [{ category: 'iso27001' }, { category: 'other' }],
      });
      // 'other' doesn't count → the remaining recommended categories are still missing
      expect(caveat).toContain('missing recommended evidence');
      expect(caveat).toContain('a security policy');
    });
  });

  describe('fallback mode (untagged / legacy uploads)', () => {
    it('flags a single untagged document with the recommended types', () => {
      const caveat = partialEvidenceCaveat({
        framework: 'DORA',
        documents: [{ fileName: 'a.pdf' }],
      });
      expect(caveat).toContain('single uploaded document');
      expect(caveat).toContain('an ISO 27001 certificate');
    });

    it('returns null for >= 2 untagged documents', () => {
      expect(partialEvidenceCaveat({ framework: 'DORA', documents: [{}, {}] })).toBeNull();
    });
  });

  it('returns null for an empty assessment (no documents)', () => {
    expect(partialEvidenceCaveat({ framework: 'DORA', documents: [] })).toBeNull();
    expect(partialEvidenceCaveat({})).toBeNull();
  });
});
