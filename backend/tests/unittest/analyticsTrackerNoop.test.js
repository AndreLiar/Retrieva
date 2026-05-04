import { describe, it, expect, vi } from 'vitest';
import { trackQueryAnalytics } from '../../services/rag/analyticsTracker.js';

const makeLogger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() });
const makeCache = () => ({ getQuestionHash: () => 'hash' });

describe('trackQueryAnalytics no-op guard', () => {
  it('returns silently when Analytics model is null', async () => {
    const logger = makeLogger();
    await trackQueryAnalytics({
      Analytics: null,
      cache: makeCache(),
      logger,
      requestId: 'r1',
      question: 'hi',
      cacheHit: false,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns silently when Analytics model lacks a create method', async () => {
    const logger = makeLogger();
    await trackQueryAnalytics({
      Analytics: { somethingElse: () => {} },
      cache: makeCache(),
      logger,
      requestId: 'r2',
      question: 'hi',
      cacheHit: true,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('writes through when a valid Analytics model is provided', async () => {
    const create = vi.fn().mockResolvedValue({});
    const logger = makeLogger();
    await trackQueryAnalytics({
      Analytics: { create },
      cache: makeCache(),
      logger,
      requestId: 'r3',
      question: 'hi',
      cacheHit: false,
      citedSources: [{ url: 'u', title: 't', type: 'page' }],
      conversationId: 'c1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs but does not throw when Analytics.create rejects', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const logger = makeLogger();
    await trackQueryAnalytics({
      Analytics: { create },
      cache: makeCache(),
      logger,
      requestId: 'r4',
      question: 'hi',
      cacheHit: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Analytics tracking failed',
      expect.any(Object)
    );
  });
});
