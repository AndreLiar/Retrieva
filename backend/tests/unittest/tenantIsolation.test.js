/**
 * Unit tests for Tenant Isolation Security Layer
 * Verifies that all Qdrant searches are blocked without workspaceId filter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateWorkspaceFilter,
  wrapWithTenantIsolation,
  hasTenantIsolation,
  createWorkspaceScopedFilter,
  TenantIsolationError,
} from '../../services/security/tenantIsolation.js';

// Mock logger to prevent console output during tests
vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Tenant Isolation Security Layer', () => {
  describe('validateWorkspaceFilter', () => {
    it('should return invalid for null filter', () => {
      const result = validateWorkspaceFilter(null);
      expect(result.valid).toBe(false);
      expect(result.workspaceId).toBeNull();
    });

    it('should return invalid for undefined filter', () => {
      const result = validateWorkspaceFilter(undefined);
      expect(result.valid).toBe(false);
      expect(result.workspaceId).toBeNull();
    });

    it('should return invalid for empty filter', () => {
      const result = validateWorkspaceFilter({});
      expect(result.valid).toBe(false);
      expect(result.workspaceId).toBeNull();
    });

    it('should return invalid for filter without workspaceId', () => {
      const result = validateWorkspaceFilter({
        must: [
          { key: 'metadata.sourceId', match: { value: 'some-source' } },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.workspaceId).toBeNull();
    });

    it('should return valid for filter with workspaceId in must array', () => {
      const result = validateWorkspaceFilter({
        must: [
          { key: 'metadata.workspaceId', match: { value: 'workspace-123' } },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.workspaceId).toBe('workspace-123');
    });

    it('should return valid when workspaceId is among multiple filters', () => {
      const result = validateWorkspaceFilter({
        must: [
          { key: 'metadata.workspaceId', match: { value: 'workspace-abc' } },
          { key: 'metadata.sourceId', match: { value: 'doc-456' } },
          { key: 'metadata.page', range: { gte: 1, lte: 10 } },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.workspaceId).toBe('workspace-abc');
    });

    it('should reject non-string workspaceId values', () => {
      const result = validateWorkspaceFilter({
        must: [
          { key: 'metadata.workspaceId', match: { value: 12345 } },
        ],
      });
      expect(result.valid).toBe(false);
    });

    it('should reject null workspaceId values', () => {
      const result = validateWorkspaceFilter({
        must: [
          { key: 'metadata.workspaceId', match: { value: null } },
        ],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('wrapWithTenantIsolation', () => {
    let mockVectorStore;

    beforeEach(() => {
      mockVectorStore = {
        similaritySearch: vi.fn().mockResolvedValue([{ pageContent: 'test', metadata: {} }]),
        similaritySearchWithScore: vi.fn().mockResolvedValue([[{ pageContent: 'test' }, 0.9]]),
        asRetriever: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue([]),
          _getRelevantDocuments: vi.fn().mockResolvedValue([]),
        }),
      };
    });

    it('should throw error if vector store is null', () => {
      expect(() => wrapWithTenantIsolation(null)).toThrow('Vector store is required');
    });

    it('should not double-wrap an already wrapped store', () => {
      const wrapped = wrapWithTenantIsolation(mockVectorStore);
      const doubleWrapped = wrapWithTenantIsolation(wrapped);
      expect(wrapped).toBe(doubleWrapped);
    });

    it('should mark store as having tenant isolation', () => {
      const wrapped = wrapWithTenantIsolation(mockVectorStore);
      expect(hasTenantIsolation(wrapped)).toBe(true);
    });

    describe('similaritySearch', () => {
      it('should reject search without filter', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        await expect(wrapped.similaritySearch('query', 10))
          .rejects.toThrow(TenantIsolationError);
      });

      it('should reject search with filter missing workspaceId', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        const badFilter = { must: [{ key: 'other', match: { value: 'test' } }] };
        await expect(wrapped.similaritySearch('query', 10, badFilter))
          .rejects.toThrow(TenantIsolationError);
      });

      it('should allow search with valid workspaceId filter', async () => {
        // Track if original was called
        let originalCalled = false;
        let originalArgs = null;
        mockVectorStore.similaritySearch = vi.fn().mockImplementation((...args) => {
          originalCalled = true;
          originalArgs = args;
          return Promise.resolve([{ pageContent: 'test', metadata: {} }]);
        });

        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        const goodFilter = {
          must: [{ key: 'metadata.workspaceId', match: { value: 'ws-123' } }],
        };
        const result = await wrapped.similaritySearch('query', 10, goodFilter);
        expect(result).toHaveLength(1);
        expect(originalCalled).toBe(true);
        expect(originalArgs).toEqual(['query', 10, goodFilter]);
      });
    });

    describe('similaritySearchWithScore', () => {
      it('should reject search without workspaceId', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        await expect(wrapped.similaritySearchWithScore('query', 10))
          .rejects.toThrow(TenantIsolationError);
      });

      it('should allow search with valid workspaceId filter', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        const goodFilter = {
          must: [{ key: 'metadata.workspaceId', match: { value: 'ws-456' } }],
        };
        const result = await wrapped.similaritySearchWithScore('query', 10, goodFilter);
        expect(result).toHaveLength(1);
      });
    });

    describe('asRetriever', () => {
      it('should throw when invoking retriever without filter', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        const retriever = wrapped.asRetriever({});
        await expect(retriever.invoke('query'))
          .rejects.toThrow(TenantIsolationError);
      });

      it('should allow retriever with valid filter', async () => {
        const wrapped = wrapWithTenantIsolation(mockVectorStore);
        const filter = {
          must: [{ key: 'metadata.workspaceId', match: { value: 'ws-789' } }],
        };
        const retriever = wrapped.asRetriever({ filter });
        // Should not throw
        await expect(retriever.invoke('query')).resolves.toBeDefined();
      });
    });
  });

  describe('createWorkspaceScopedFilter', () => {
    it('should throw for missing workspaceId', () => {
      expect(() => createWorkspaceScopedFilter(null))
        .toThrow(TenantIsolationError);
    });

    it('should throw for non-string workspaceId', () => {
      expect(() => createWorkspaceScopedFilter(12345))
        .toThrow(TenantIsolationError);
    });

    it('should create valid filter with workspaceId', () => {
      const filter = createWorkspaceScopedFilter('my-workspace');
      expect(filter.must).toHaveLength(1);
      expect(filter.must[0]).toEqual({
        key: 'metadata.workspaceId',
        match: { value: 'my-workspace' },
      });
    });

    it('should merge additional filters', () => {
      const additionalFilters = {
        must: [
          { key: 'metadata.page', match: { value: 5 } },
        ],
      };
      const filter = createWorkspaceScopedFilter('my-workspace', additionalFilters);
      expect(filter.must).toHaveLength(2);
      expect(filter.must[0].key).toBe('metadata.workspaceId');
      expect(filter.must[1].key).toBe('metadata.page');
    });
  });

  describe('TenantIsolationError', () => {
    it('should have correct properties', () => {
      const error = new TenantIsolationError('Test error');
      expect(error.name).toBe('TenantIsolationError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(403);
      expect(error.isSecurityError).toBe(true);
    });

    it('should be instanceof Error', () => {
      const error = new TenantIsolationError('Test');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('hasTenantIsolation', () => {
    it('should return false for null', () => {
      expect(hasTenantIsolation(null)).toBe(false);
    });

    it('should return false for unwrapped store', () => {
      expect(hasTenantIsolation({})).toBe(false);
    });

    it('should return true for wrapped store', () => {
      const mockStore = {
        similaritySearch: vi.fn(),
        asRetriever: vi.fn().mockReturnValue({ invoke: vi.fn() }),
      };
      const wrapped = wrapWithTenantIsolation(mockStore);
      expect(hasTenantIsolation(wrapped)).toBe(true);
    });
  });
});
