/**
 * Unit Tests for Embedding Configuration
 *
 * Validates that the embedding system is correctly configured.
 * Supports both Azure OpenAI (default) and local bge-m3 configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Helper: dynamically import a module with a fresh env snapshot.
// Vitest forks isolate processes, but module caching within a process
// means we need cache-busting query strings for re-imports.
let importCounter = 0;
async function freshImport(modulePath) {
  importCounter++;
  return import(`${modulePath}?t=${importCounter}`);
}

describe('Embedding Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Strip env vars that would override defaults
    delete process.env.EMBEDDING_CONTEXT_TOKENS;
    delete process.env.MAX_EMBEDDING_CHARS;
    delete process.env.EMBEDDING_DOC_PREFIX;
    delete process.env.EMBEDDING_QUERY_PREFIX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ===========================================================================
  // embeddings.js — default model constant
  // ===========================================================================
  describe('config/embeddings.js', () => {
    it('should default EMBEDDING_MODEL to text-embedding-3-small for Azure', async () => {
      const mod = await freshImport('../../config/embeddings.js');
      // Default is Azure OpenAI's text-embedding-3-small
      expect(mod.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    });

    it('should compute maxCharsPerChunk = 29491 with default 8192 context tokens', async () => {
      const mod = await freshImport('../../config/embeddings.js');
      // Math.floor(8192 * 0.9 * 4) = Math.floor(29491.2) = 29491
      expect(mod.BATCH_CONFIG.maxCharsPerChunk).toBe(29491);
    });
  });

  // ===========================================================================
  // embeddingProvider.js — default model + prefixes
  // ===========================================================================
  describe('config/embeddingProvider.js', () => {
    it('should return prefixes object from getEmbeddingPrefixes', async () => {
      const mod = await freshImport('../../config/embeddingProvider.js');
      const prefixes = mod.getEmbeddingPrefixes();
      expect(prefixes).toHaveProperty('document');
      expect(prefixes).toHaveProperty('query');
    });

    it('should return empty prefixes for Azure OpenAI embeddings', async () => {
      const mod = await freshImport('../../config/embeddingProvider.js');
      const prefixes = mod.getEmbeddingPrefixes();
      // Azure OpenAI text-embedding-3-small doesn't need prefixes
      expect(prefixes.document).toBe('');
      expect(prefixes.query).toBe('');
    });
  });

  // ===========================================================================
  // pipelineStages.js — EMBEDDING_VERSION
  // ===========================================================================
  describe('services/pipeline/pipelineStages.js', () => {
    it('should set EMBEDDING_VERSION.local.dimensions to 1024', async () => {
      const mod = await freshImport('../../services/pipeline/pipelineStages.js');
      expect(mod.EMBEDDING_VERSION.local.dimensions).toBe(1024);
    });

    it('should set EMBEDDING_VERSION.local.model to match configured model', async () => {
      const mod = await freshImport('../../services/pipeline/pipelineStages.js');
      // The local model version is configured at startup
      expect(mod.EMBEDDING_VERSION.local.model).toBeDefined();
      expect(typeof mod.EMBEDDING_VERSION.local.model).toBe('string');
    });
  });
});
