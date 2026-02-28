/**
 * Frontend Tests — RiskScoringPanel components
 *
 * Covers:
 *  - InherentResidualPanel: inherent risk derivation, arrow direction, residual display
 *  - WeightedDomainChart: domain grouping, score calculation, overall weighted %
 *  - FormalRiskDecision: existing decision display, button rendering, mutation trigger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Assessment } from '@/lib/api/assessments';
import type { WorkspaceWithMembership } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api/assessments', () => ({
  assessmentsApi: {
    setRiskDecision: vi.fn().mockResolvedValue({ status: 'success' }),
  },
}));

import { InherentResidualPanel, WeightedDomainChart, FormalRiskDecision } from '@/components/assessment/RiskScoringPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    _id: 'aaa111',
    workspaceId: 'ws-001',
    name: 'Q1 DORA',
    vendorName: 'Acme',
    framework: 'DORA',
    status: 'complete',
    statusMessage: '',
    documents: [],
    createdBy: 'user-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    results: {
      gaps: [],
      overallRisk: 'Medium',
      summary: 'Test summary',
      generatedAt: '2026-01-01T00:00:00.000Z',
      domainsAnalyzed: [],
    },
    riskDecision: null,
    clauseSignoffs: [],
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<WorkspaceWithMembership> = {}): WorkspaceWithMembership {
  return {
    id: 'ws-001',
    name: 'Test Vendor',
    vendorTier: 'important',
    serviceType: 'cloud',
    myRole: 'owner',
    permissions: { canQuery: true, canViewSources: true, canInvite: true },
    ...overrides,
  } as WorkspaceWithMembership;
}

// ---------------------------------------------------------------------------
// InherentResidualPanel
// ---------------------------------------------------------------------------

describe('InherentResidualPanel', () => {
  it('renders nothing when residualRisk is missing', () => {
    const assessment = makeAssessment({ results: undefined });
    const { container } = render(
      <InherentResidualPanel assessment={assessment} workspace={makeWorkspace()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders inherent and residual risk boxes', () => {
    render(<InherentResidualPanel assessment={makeAssessment()} workspace={makeWorkspace()} />);
    expect(screen.getByText('Inherent risk')).toBeDefined();
    expect(screen.getByText('Residual risk')).toBeDefined();
  });

  it('shows High inherent risk for critical tier vendors', () => {
    const workspace = makeWorkspace({ vendorTier: 'critical' });
    render(<InherentResidualPanel assessment={makeAssessment()} workspace={workspace} />);
    // Both boxes rendered — inherent should show High
    const allHighTexts = screen.getAllByText('High');
    expect(allHighTexts.length).toBeGreaterThan(0);
  });

  it('shows Medium inherent risk for important tier with non-critical service', () => {
    const workspace = makeWorkspace({ vendorTier: 'important', serviceType: 'hr' });
    render(<InherentResidualPanel assessment={makeAssessment()} workspace={workspace} />);
    const allMedium = screen.getAllByText('Medium');
    expect(allMedium.length).toBeGreaterThan(0);
  });

  it('shows Low inherent risk for standard tier', () => {
    const workspace = makeWorkspace({ vendorTier: 'standard', serviceType: 'hr' });
    render(<InherentResidualPanel assessment={makeAssessment()} workspace={workspace} />);
    // Inherent should be Low, residual Medium (from assessment)
    expect(screen.getByText('Low')).toBeDefined();
    expect(screen.getByText('Medium')).toBeDefined();
  });

  it('shows "reduced by controls" when residual < inherent', () => {
    // critical tier = inherent High, residual Low
    const assessment = makeAssessment({ results: { gaps: [], overallRisk: 'Low', generatedAt: '', domainsAnalyzed: [] } });
    const workspace = makeWorkspace({ vendorTier: 'critical' });
    render(<InherentResidualPanel assessment={assessment} workspace={workspace} />);
    expect(screen.getByText('reduced by controls')).toBeDefined();
  });

  it('shows "elevated by gaps" when residual > inherent', () => {
    // standard tier = inherent Low, residual High
    const assessment = makeAssessment({ results: { gaps: [], overallRisk: 'High', generatedAt: '', domainsAnalyzed: [] } });
    const workspace = makeWorkspace({ vendorTier: 'standard', serviceType: 'hr' });
    render(<InherentResidualPanel assessment={assessment} workspace={workspace} />);
    expect(screen.getByText('elevated by gaps')).toBeDefined();
  });

  it('shows "unchanged" when residual equals inherent', () => {
    // important + cloud = inherent High, residual High
    const assessment = makeAssessment({ results: { gaps: [], overallRisk: 'High', generatedAt: '', domainsAnalyzed: [] } });
    const workspace = makeWorkspace({ vendorTier: 'important', serviceType: 'cloud' });
    render(<InherentResidualPanel assessment={assessment} workspace={workspace} />);
    expect(screen.getByText('unchanged')).toBeDefined();
  });

  it('shows vendor tier and service type classification text', () => {
    render(<InherentResidualPanel assessment={makeAssessment()} workspace={makeWorkspace()} />);
    expect(screen.getAllByText(/important/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cloud/).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// WeightedDomainChart
// ---------------------------------------------------------------------------

describe('WeightedDomainChart', () => {
  it('renders nothing when gaps array is empty', () => {
    const assessment = makeAssessment({ results: { gaps: [], overallRisk: 'Low', generatedAt: '', domainsAnalyzed: [] } });
    const { container } = render(<WeightedDomainChart assessment={assessment} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders domain rows for gaps with domains', () => {
    const assessment = makeAssessment({
      results: {
        overallRisk: 'Medium', generatedAt: '', domainsAnalyzed: [],
        gaps: [
          { article: 'Art.28(1)', domain: 'Security Controls', requirement: 'req1', gapLevel: 'covered', vendorCoverage: '', recommendation: '', sourceChunks: [] },
          { article: 'Art.28(2)', domain: 'Security Controls', requirement: 'req2', gapLevel: 'missing', vendorCoverage: '', recommendation: '', sourceChunks: [] },
          { article: 'Art.28(3)', domain: 'ICT Governance',   requirement: 'req3', gapLevel: 'partial',  vendorCoverage: '', recommendation: '', sourceChunks: [] },
        ],
      },
    });
    render(<WeightedDomainChart assessment={assessment} />);
    expect(screen.getByText('Security Controls')).toBeDefined();
    expect(screen.getByText('ICT Governance')).toBeDefined();
  });

  it('shows a weighted overall % score', () => {
    const assessment = makeAssessment({
      results: {
        overallRisk: 'Medium', generatedAt: '', domainsAnalyzed: [],
        gaps: [
          { article: 'Art.28(1)', domain: 'Security Controls', requirement: 'req1', gapLevel: 'covered', vendorCoverage: '', recommendation: '', sourceChunks: [] },
        ],
      },
    });
    render(<WeightedDomainChart assessment={assessment} />);
    expect(screen.getByText(/weighted/)).toBeDefined();
  });

  it('shows covered/partial/missing counts per domain', () => {
    const assessment = makeAssessment({
      results: {
        overallRisk: 'Medium', generatedAt: '', domainsAnalyzed: [],
        gaps: [
          { article: 'Art.28(1)', domain: 'Security Controls', requirement: 'r1', gapLevel: 'covered', vendorCoverage: '', recommendation: '', sourceChunks: [] },
          { article: 'Art.28(2)', domain: 'Security Controls', requirement: 'r2', gapLevel: 'partial',  vendorCoverage: '', recommendation: '', sourceChunks: [] },
          { article: 'Art.28(3)', domain: 'Security Controls', requirement: 'r3', gapLevel: 'missing',  vendorCoverage: '', recommendation: '', sourceChunks: [] },
        ],
      },
    });
    render(<WeightedDomainChart assessment={assessment} />);
    // Each count rendered as "N ✓", "N ~", "N ✗"
    expect(screen.getByText('1 ✓')).toBeDefined();
    expect(screen.getByText('1 ~')).toBeDefined();
    expect(screen.getByText('1 ✗')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// FormalRiskDecision
// ---------------------------------------------------------------------------

describe('FormalRiskDecision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "No formal decision" text when riskDecision is null', () => {
    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    expect(screen.getByText(/No formal decision/)).toBeDefined();
  });

  it('renders three decision buttons', () => {
    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    expect(screen.getByText('Proceed')).toBeDefined();
    expect(screen.getByText('Proceed with Conditions')).toBeDefined();
    expect(screen.getByText('Reject')).toBeDefined();
  });

  it('shows existing decision when riskDecision is set', () => {
    const assessment = makeAssessment({
      riskDecision: {
        decision: 'proceed',
        setBy: 'user-001',
        setByName: 'Alice',
        rationale: 'All controls in place',
        setAt: '2026-01-15T10:00:00.000Z',
      },
    });
    render(<FormalRiskDecision assessment={assessment} assessmentId="aaa111" />);
    // 'Proceed' appears as both the badge (existing decision) and the button — use getAllByText
    expect(screen.getAllByText('Proceed').length).toBeGreaterThan(0);
    expect(screen.getByText(/All controls in place/)).toBeDefined();
    expect(screen.getByText(/Alice/)).toBeDefined();
  });

  it('shows rationale textarea after clicking a decision button', () => {
    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    fireEvent.click(screen.getByText('Proceed'));
    expect(screen.getByPlaceholderText(/Rationale/)).toBeDefined();
    expect(screen.getByText('Confirm')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('hides the textarea when cancel is clicked', () => {
    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    fireEvent.click(screen.getByText('Proceed'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText(/Rationale/)).toBeNull();
  });

  it('calls mutation.mutate when Confirm is clicked', async () => {
    const { useMutation } = vi.mocked(await import('@tanstack/react-query'));
    const mockMutate = vi.fn();
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockMutate, isPending: false });

    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    fireEvent.click(screen.getByText('Reject'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'reject' })
    );
  });

  it('shows "Saving…" text while mutation is pending', async () => {
    const { useMutation } = vi.mocked(await import('@tanstack/react-query'));
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: true });

    render(<FormalRiskDecision assessment={makeAssessment()} assessmentId="aaa111" />);
    fireEvent.click(screen.getByText('Proceed'));
    expect(screen.getByText('Saving…')).toBeDefined();
  });

  it('shows "To change this decision" hint when decision already exists', () => {
    const assessment = makeAssessment({
      riskDecision: {
        decision: 'conditional',
        setBy: 'user-001',
        setByName: 'Alice',
        rationale: '',
        setAt: '2026-01-15T10:00:00.000Z',
      },
    });
    render(<FormalRiskDecision assessment={assessment} assessmentId="aaa111" />);
    expect(screen.getByText(/To change this decision/)).toBeDefined();
  });
});
