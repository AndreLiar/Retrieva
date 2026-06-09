import { describe, it, expect } from 'vitest';
import { partialEvidenceCaveat } from '../../services/reportGenerator.js';

/**
 * #395 phase 2c — the generated report must flag a "reduced confidence" caveat
 * when an assessment was run on a partial document set, so a shallow analysis
 * isn't read as complete.
 */
describe('reportGenerator — partial-evidence caveat (#395)', () => {
  it('returns a DORA caveat listing recommended docs for a single-document assessment', () => {
    const caveat = partialEvidenceCaveat({ framework: 'DORA', documents: [{ fileName: 'a.pdf' }] });
    expect(caveat).toContain('DORA gap analysis');
    expect(caveat).toContain('single uploaded document');
    expect(caveat).toContain('ISO 27001');
    expect(caveat).toContain('SOC 2');
  });

  it('returns a contract-review caveat with Art.30 annexes', () => {
    const caveat = partialEvidenceCaveat({
      framework: 'CONTRACT_A30',
      documents: [{ fileName: 'msa.pdf' }],
    });
    expect(caveat).toContain('Article 30 contract review');
    expect(caveat).toContain('SLA annex');
    expect(caveat).toContain('subcontractor list');
  });

  it('returns null when the evidence base is adequate (>= 2 documents)', () => {
    expect(partialEvidenceCaveat({ framework: 'DORA', documents: [{}, {}] })).toBeNull();
    expect(partialEvidenceCaveat({ framework: 'DORA', documents: [{}, {}, {}] })).toBeNull();
  });

  it('returns null for an empty assessment (no documents) — a different problem', () => {
    expect(partialEvidenceCaveat({ framework: 'DORA', documents: [] })).toBeNull();
    expect(partialEvidenceCaveat({ framework: 'DORA' })).toBeNull();
    expect(partialEvidenceCaveat({})).toBeNull();
  });
});
