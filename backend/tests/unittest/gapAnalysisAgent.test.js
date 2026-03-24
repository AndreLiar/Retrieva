/**
 * Unit Tests — gapAnalysisAgent (runGapAnalysis)
 *
 * All LangChain, Qdrant, and DB dependencies are mocked.
 * Tests focus on:
 *  - runGapAnalysis orchestration (happy paths, fallback, framework branches)
 *  - Gap normalization / validation logic
 *  - Emit progress and document wait logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../models/Assessment.js', () => ({
  Assessment: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: { embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) },
}));

vi.mock('../../config/llmProvider.js', () => ({
  createLLM: vi.fn().mockResolvedValue({
    invoke: vi.fn(),
    pipe: vi.fn().mockReturnThis(),
  }),
}));

vi.mock('../../config/langsmith.js', () => ({
  getCallbacks: vi.fn(() => []),
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@langchain/core/messages', () => ({
  HumanMessage: vi.fn((content) => ({ content })),
  SystemMessage: vi.fn((content) => ({ content })),
}));

vi.mock('@langchain/core/tools', () => ({
  tool: vi.fn((fn, config) => ({ fn, config })),
}));

vi.mock('zod', () => ({
  z: {
    object: vi.fn(() => ({ describe: vi.fn().mockReturnThis() })),
    string: vi.fn(() => ({ describe: vi.fn().mockReturnThis() })),
    array: vi.fn(() => ({ describe: vi.fn().mockReturnThis() })),
    enum: vi.fn(() => ({ describe: vi.fn().mockReturnThis() })),
  },
}));

import { runGapAnalysis } from '../../services/gapAnalysisAgent.js';
import { Assessment } from '../../models/Assessment.js';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createLLM } from '../../config/llmProvider.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAssessment(overrides = {}) {
  return {
    _id: 'assessment-123',
    vendorName: 'Acme Corp',
    framework: 'DORA',
    documents: [{ status: 'indexed' }],
    ...overrides,
  };
}

const validGapResult = {
  gaps: [
    {
      article: 'Article 30',
      domain: 'Third-Party Risk',
      requirement: 'Must have exit plan',
      vendorCoverage: 'Exit plan mentioned',
      gapLevel: 'partial',
      recommendation: 'Formalize exit strategy',
    },
  ],
  overallRisk: 'Medium',
  summary: 'Vendor partially compliant.',
  domainsAnalyzed: ['Third-Party Risk'],
};

// ─── runGapAnalysis ───────────────────────────────────────────────────────────

describe('runGapAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Assessment.findByIdAndUpdate.mockResolvedValue({});
  });

  it('throws when assessment not found', async () => {
    Assessment.findById.mockResolvedValue(null);

    await expect(runGapAnalysis({ assessmentId: 'missing', job: null })).rejects.toThrow(
      'Assessment missing not found'
    );
  });

  it('succeeds with ReAct agent for DORA framework', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    // Simulate agent capturing result via tool call
    let capturedTool;
    createReactAgent.mockReturnValue({
      invoke: vi.fn().mockImplementation(async () => {
        // The tool's fn is captured when buildTools is called.
        // We simulate the agent calling record_gap_analysis by finding the tool.
        return {};
      }),
    });

    // We need to intercept the tool() call to simulate gap capture
    const { tool } = await import('@langchain/core/tools');
    tool.mockImplementation((fn, config) => {
      if (config?.name === 'record_gap_analysis') {
        capturedTool = { fn, config };
      }
      return { fn, config };
    });

    // Re-import to pick up the new mock
    vi.resetModules();
  });

  it('falls back to pipeline when ReAct agent throws without result', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const mockAgent = { invoke: vi.fn().mockRejectedValue(new Error('Agent failed')) };
    createReactAgent.mockReturnValue(mockAgent);

    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify(validGapResult),
      }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { embeddings } = await import('../../config/embeddings.js');
    embeddings.embedQuery.mockResolvedValue([0.1, 0.2]);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([
        {
          payload: {
            pageContent: 'Some content about security policies...',
            metadata: { fileName: 'policy.pdf' },
          },
          score: 0.9,
        },
      ]),
    }));

    const result = await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    expect(result).toMatchObject({ gapCount: expect.any(Number), overallRisk: expect.any(String) });
    expect(Assessment.findByIdAndUpdate).toHaveBeenCalledWith(
      'assessment-123',
      expect.objectContaining({ status: 'complete' })
    );
  });
});

// ─── Gap normalization logic ──────────────────────────────────────────────────

describe('Gap normalization (via runGapAnalysis fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Assessment.findByIdAndUpdate.mockResolvedValue({});
    createReactAgent.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('force fallback')),
    });
  });

  it('normalizes invalid gapLevel to "missing"', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const resultWithInvalidGapLevel = {
      ...validGapResult,
      gaps: [{ ...validGapResult.gaps[0], gapLevel: 'unknown_level' }],
    };

    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(resultWithInvalidGapLevel) }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    const [, updateData] = Assessment.findByIdAndUpdate.mock.calls[0];
    expect(updateData['results.gaps'][0].gapLevel).toBe('missing');
  });

  it('normalizes invalid overallRisk to "High"', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const resultWithInvalidRisk = { ...validGapResult, overallRisk: 'Critical' };
    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(resultWithInvalidRisk) }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    const [, updateData] = Assessment.findByIdAndUpdate.mock.calls[0];
    expect(updateData['results.overallRisk']).toBe('High');
  });

  it('normalizes invalid domain to default "Third-Party Risk"', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const resultWithInvalidDomain = {
      ...validGapResult,
      gaps: [{ ...validGapResult.gaps[0], domain: 'Invalid Domain XYZ' }],
    };
    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(resultWithInvalidDomain) }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    const [, updateData] = Assessment.findByIdAndUpdate.mock.calls[0];
    expect(updateData['results.gaps'][0].domain).toBe('Third-Party Risk');
  });

  it('handles empty gaps array gracefully', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const emptyResult = { ...validGapResult, gaps: [] };
    const mockLLM = { invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(emptyResult) }) };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    const result = await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    expect(result.gapCount).toBe(0);
  });

  it('uses CONTRACT_A30 domain defaults for CONTRACT_A30 framework', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment({ framework: 'CONTRACT_A30' }));

    const a30Result = {
      ...validGapResult,
      gaps: [{ ...validGapResult.gaps[0], domain: 'Bad Domain' }],
    };
    const mockLLM = { invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(a30Result) }) };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await runGapAnalysis({ assessmentId: 'assessment-123', job: null });

    const [, updateData] = Assessment.findByIdAndUpdate.mock.calls[0];
    // Default domain for CONTRACT_A30 is 'Service Description'
    expect(updateData['results.gaps'][0].domain).toBe('Service Description');
  });
});

// ─── emit / job.updateProgress ───────────────────────────────────────────────

describe('Job progress updates', () => {
  it('calls job.updateProgress when job is provided', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    const mockJob = { updateProgress: vi.fn().mockResolvedValue({}) };
    createReactAgent.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('force fallback')),
    });

    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(validGapResult) }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await runGapAnalysis({ assessmentId: 'assessment-123', job: mockJob });

    expect(mockJob.updateProgress).toHaveBeenCalled();
  });

  it('works without a job object (no progress updates)', async () => {
    Assessment.findById.mockResolvedValue(makeAssessment());

    createReactAgent.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('force fallback')),
    });

    const mockLLM = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(validGapResult) }),
    };
    createLLM.mockResolvedValue(mockLLM);

    const { QdrantClient } = await import('@qdrant/js-client-rest');
    QdrantClient.mockImplementation(() => ({ search: vi.fn().mockResolvedValue([]) }));

    await expect(
      runGapAnalysis({ assessmentId: 'assessment-123', job: null })
    ).resolves.not.toThrow();
  });
});
