/**
 * Unit Tests — Assessment: Pure Functions & Model Validation
 *
 * Covers:
 *  - chunkText() pure function (fileIngestionService)
 *  - assessmentCollectionName() helper
 *  - Assessment Mongoose model validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock side-effecting config imports that fileIngestionService.js pulls in
// ---------------------------------------------------------------------------

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../config/embeddings.js', () => ({
  embeddings: {
    embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  },
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    getCollection: vi.fn().mockResolvedValue({}),
    createCollection: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([]),
    deleteCollection: vi.fn().mockResolvedValue({}),
  })),
}));

// ---------------------------------------------------------------------------
// Subject imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { chunkText, assessmentCollectionName } from '../../services/fileIngestionService.js';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Assessment } from '../../models/Assessment.js';

// ===========================================================================
// chunkText() — pure function, no side effects
// ===========================================================================

describe('chunkText()', () => {
  it('returns an empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('filters out chunks shorter than 30 characters (noise threshold)', () => {
    // "Hi." is 3 chars — below the 30-char filter
    expect(chunkText('Hi.')).toEqual([]);
  });

  it('returns a single chunk for short text that fits within chunk size', () => {
    const text = 'This is a simple paragraph that is longer than thirty characters.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits long text at paragraph boundaries', () => {
    const para1 = 'A'.repeat(400);
    const para2 = 'B'.repeat(400);
    const text = `${para1}\n\n${para2}`;
    const chunks = chunkText(text, 600, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toContain('A');
    expect(chunks.some((c) => c.includes('B'))).toBe(true);
  });

  it('handles long paragraphs without line breaks via sentence splitting', () => {
    // Build a long single-paragraph text > CHUNK_SIZE
    const sentence = 'This is a well-formed sentence that carries meaningful information. ';
    const longPara = sentence.repeat(20); // ~1300 chars
    const chunks = chunkText(longPara, 600, 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeGreaterThan(30));
  });

  it('filters short chunks from paragraph split', () => {
    // "OK" (2 chars) comes from the first paragraph — should be filtered
    const text =
      'OK\n\nThis is a much longer paragraph that definitely exceeds the minimum threshold here.';
    const chunks = chunkText(text, 600, 100);
    chunks.forEach((c) => expect(c.length).toBeGreaterThan(30));
  });

  it('normalises CRLF line endings', () => {
    const text =
      'First paragraph.\r\n\r\nSecond paragraph that is long enough to be kept as a chunk.';
    const chunks = chunkText(text, 600, 100);
    expect(chunks.some((c) => c.includes('Second paragraph'))).toBe(true);
    chunks.forEach((c) => expect(c).not.toContain('\r'));
  });

  it('collapses triple+ blank lines', () => {
    const text =
      'Paragraph one that is long enough.\n\n\n\nParagraph two that is also long enough to keep.';
    const chunks = chunkText(text, 600, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('produces multiple chunks with a smaller chunk size', () => {
    // Text has sentence-ending punctuation so the sentence splitter can split it
    const sentence = 'This sentence has a period at the end. ';
    const text = sentence.repeat(20); // ~780 chars total
    const chunks = chunkText(text, 200, 20);
    // Should produce more than 1 chunk given the small chunk size
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ===========================================================================
// assessmentCollectionName() — pure function
// ===========================================================================

describe('assessmentCollectionName()', () => {
  it('formats collection name with prefix', () => {
    expect(assessmentCollectionName('abc123')).toBe('assessment_abc123');
  });

  it('works with MongoDB ObjectId-like strings', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(assessmentCollectionName(id)).toBe(`assessment_${id}`);
  });
});

// ===========================================================================
// Assessment Mongoose model validation
// ===========================================================================

describe('Assessment model', () => {
  let mongoServer;

  beforeEach(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const validPayload = () => ({
    workspaceId: new mongoose.Types.ObjectId(),
    name: 'DORA Assessment Q1',
    vendorName: 'Acme Corp',
    framework: 'DORA',
    status: 'pending',
    createdBy: 'user-123',
  });

  it('creates a valid assessment with defaults', async () => {
    const assessment = await Assessment.create(validPayload());
    expect(assessment._id).toBeDefined();
    expect(assessment.framework).toBe('DORA');
    expect(assessment.status).toBe('pending');
    expect(assessment.statusMessage).toBe('');
    expect(assessment.documents).toHaveLength(0);
  });

  it('requires name', async () => {
    const payload = validPayload();
    delete payload.name;
    await expect(Assessment.create(payload)).rejects.toThrow(/name/i);
  });

  it('requires vendorName', async () => {
    const payload = validPayload();
    delete payload.vendorName;
    await expect(Assessment.create(payload)).rejects.toThrow(/vendorName/i);
  });

  it('requires workspaceId', async () => {
    const payload = validPayload();
    delete payload.workspaceId;
    await expect(Assessment.create(payload)).rejects.toThrow(/workspaceId/i);
  });

  it('requires createdBy', async () => {
    const payload = validPayload();
    delete payload.createdBy;
    await expect(Assessment.create(payload)).rejects.toThrow(/createdBy/i);
  });

  it('rejects invalid status values', async () => {
    const payload = { ...validPayload(), status: 'invalid_status' };
    await expect(Assessment.create(payload)).rejects.toThrow();
  });

  it('rejects invalid framework values', async () => {
    const payload = { ...validPayload(), framework: 'GDPR' };
    await expect(Assessment.create(payload)).rejects.toThrow();
  });

  it('sets timestamps automatically', async () => {
    const assessment = await Assessment.create(validPayload());
    expect(assessment.createdAt).toBeInstanceOf(Date);
    expect(assessment.updatedAt).toBeInstanceOf(Date);
  });

  it('trims name and vendorName', async () => {
    const payload = { ...validPayload(), name: '  My Assessment  ', vendorName: '  Acme  ' };
    const assessment = await Assessment.create(payload);
    expect(assessment.name).toBe('My Assessment');
    expect(assessment.vendorName).toBe('Acme');
  });

  it('enforces maxlength of 200 on name', async () => {
    const payload = { ...validPayload(), name: 'A'.repeat(201) };
    await expect(Assessment.create(payload)).rejects.toThrow();
  });

  it('stores gap results with correct structure', async () => {
    const payload = {
      ...validPayload(),
      status: 'complete',
      results: {
        overallRisk: 'High',
        summary: 'Vendor has critical gaps in ICT risk management.',
        domainsAnalyzed: ['ICT Risk Management', 'Third-Party Risk'],
        generatedAt: new Date(),
        gaps: [
          {
            article: 'Article 5',
            domain: 'ICT Risk Management',
            requirement: 'Maintain an updated ICT risk management framework',
            vendorCoverage: 'Partial mention in section 3',
            gapLevel: 'partial',
            recommendation: 'Require explicit framework documentation',
            sourceChunks: ['chunk-1', 'chunk-2'],
          },
        ],
      },
    };
    const assessment = await Assessment.create(payload);
    expect(assessment.results.gaps).toHaveLength(1);
    expect(assessment.results.gaps[0].gapLevel).toBe('partial');
    expect(assessment.results.overallRisk).toBe('High');
    expect(assessment.results.domainsAnalyzed).toContain('ICT Risk Management');
  });

  it('rejects invalid gapLevel in results', async () => {
    const payload = {
      ...validPayload(),
      status: 'complete',
      results: {
        gaps: [
          {
            article: 'Article 5',
            requirement: 'Some requirement',
            gapLevel: 'unknown', // invalid enum value
          },
        ],
      },
    };
    await expect(Assessment.create(payload)).rejects.toThrow();
  });

  it('stores document metadata correctly', async () => {
    const payload = {
      ...validPayload(),
      documents: [
        {
          fileName: 'policy.pdf',
          fileType: 'pdf',
          fileSize: 12345,
          status: 'indexed',
        },
      ],
    };
    const assessment = await Assessment.create(payload);
    expect(assessment.documents).toHaveLength(1);
    expect(assessment.documents[0].fileName).toBe('policy.pdf');
    expect(assessment.documents[0].fileType).toBe('pdf');
    expect(assessment.documents[0].status).toBe('indexed');
  });

  it('rejects invalid document fileType', async () => {
    const payload = {
      ...validPayload(),
      documents: [{ fileName: 'test.csv', fileType: 'csv', status: 'uploading' }],
    };
    await expect(Assessment.create(payload)).rejects.toThrow();
  });

  it('allows all valid status transitions', async () => {
    const statuses = ['pending', 'indexing', 'analyzing', 'complete', 'failed'];
    for (const status of statuses) {
      const assessment = await Assessment.create({ ...validPayload(), status });
      expect(assessment.status).toBe(status);
    }
  });
});
