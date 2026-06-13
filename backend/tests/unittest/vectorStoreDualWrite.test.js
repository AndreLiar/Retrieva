import { describe, it, expect } from 'vitest';
import {
  buildWorkspacePoints,
  deleteAssessmentChunksFromWorkspace,
  deleteWorkspaceChunks,
} from '../../config/vectorStore.js';

/**
 * #394 — dual-write of assessment documents into the shared workspace collection
 * so the chat (tenant-filtered on metadata.workspaceId) can retrieve them.
 *
 * The Qdrant-calling code is validated end-to-end on the local stack (the repo
 * does not unit-test live Qdrant calls). Here we cover the pure point-building
 * logic + the best-effort delete contract.
 */
describe('vectorStore dual-write (#394)', () => {
  it('builds points carrying workspaceId metadata + pageContent', () => {
    const points = buildWorkspacePoints({
      chunks: ['hello world chunk'],
      vectors: [[0.1, 0.2, 0.3]],
      metadata: {
        workspaceId: 'ws1',
        assessmentId: 'a1',
        fileName: 'f.pdf',
        vendorName: 'AWS',
        source: 'assessment',
      },
    });

    expect(points).toHaveLength(1);
    expect(points[0].vector).toEqual([0.1, 0.2, 0.3]);
    expect(points[0].payload.pageContent).toContain('hello world');
    expect(points[0].payload.metadata.workspaceId).toBe('ws1'); // tenant filter key
    expect(points[0].payload.metadata.assessmentId).toBe('a1');
    expect(points[0].payload.metadata.source).toBe('assessment');
    expect(points[0].payload.metadata.chunkIndex).toBe(0);
  });

  it('produces deterministic, well-formed point ids (re-index overwrites)', () => {
    const args = {
      chunks: ['c'],
      vectors: [[0.1]],
      metadata: { workspaceId: 'ws1', assessmentId: 'a1', fileName: 'f.pdf' },
    };
    const id1 = buildWorkspacePoints(args)[0].id;
    const id2 = buildWorkspacePoints(args)[0].id;
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('ids are unique per chunk and per assessment', () => {
    const base = {
      chunks: ['a', 'b'],
      vectors: [[0.1], [0.2]],
      metadata: { workspaceId: 'ws1', assessmentId: 'a1', fileName: 'f.pdf' },
    };
    const points = buildWorkspacePoints(base);
    expect(points[0].id).not.toBe(points[1].id);

    const otherAssessment = buildWorkspacePoints({
      ...base,
      metadata: { ...base.metadata, assessmentId: 'a2' },
    });
    expect(otherAssessment[0].id).not.toBe(points[0].id);
  });

  it('returns [] (no dual-write) when workspaceId or chunks are missing', () => {
    expect(
      buildWorkspacePoints({ chunks: ['x'], vectors: [[0.1]], metadata: { assessmentId: 'a1' } })
    ).toEqual([]);
    expect(
      buildWorkspacePoints({ chunks: [], vectors: [], metadata: { workspaceId: 'ws1' } })
    ).toEqual([]);
  });

  it('deleteAssessmentChunksFromWorkspace is best-effort (never throws)', async () => {
    // No Qdrant in unit tests → the internal client call fails and is swallowed.
    await expect(deleteAssessmentChunksFromWorkspace('a1')).resolves.toBeUndefined();
  });

  it('deleteWorkspaceChunks is best-effort (never throws) and no-ops without id (#417)', async () => {
    await expect(deleteWorkspaceChunks('ws1')).resolves.toBeUndefined();
    await expect(deleteWorkspaceChunks(undefined)).resolves.toBeUndefined();
  });
});
