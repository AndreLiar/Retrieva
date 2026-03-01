/**
 * Compliance Controller
 *
 * Serves DORA article reference data from the static compliance knowledge base.
 * Data is loaded once at startup from dora-articles.json.
 *
 * JSON format: { version, lastVerified, nextReviewDate, sources, articles[] }
 * Supports both base DORA articles (regulation: "DORA") and
 * EBA/ESMA/EIOPA technical standards (regulation: "DORA-RTS").
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load static reference data once at module initialization
const KB_DATA = JSON.parse(
  readFileSync(path.join(__dirname, '../data/compliance/dora-articles.json'), 'utf-8')
);

// Support both old format (plain array) and new format ({ version, articles })
const ARTICLES = Array.isArray(KB_DATA) ? KB_DATA : KB_DATA.articles;
const KB_META = Array.isArray(KB_DATA)
  ? { version: '1.0', lastVerified: null, nextReviewDate: null, sources: [] }
  : {
      version: KB_DATA.version,
      lastVerified: KB_DATA.lastVerified,
      nextReviewDate: KB_DATA.nextReviewDate,
      sources: KB_DATA.sources,
    };

// DORA chapter → article number range (base regulation only)
const CHAPTER_RANGES = {
  I: [1, 4],
  II: [5, 16],
  III: [17, 23],
  IV: [24, 27],
  V: [28, 44],
  VI: [45, 49],
};

function articleNumber(articleStr) {
  const m = articleStr.match(/Article\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * GET /api/v1/compliance/metadata
 * Returns knowledge base version, last verified date, next review date and sources.
 */
export const getMetadata = catchAsync(async (req, res) => {
  sendSuccess(res, 200, 'Knowledge base metadata retrieved', {
    version: KB_META.version,
    lastVerified: KB_META.lastVerified,
    nextReviewDate: KB_META.nextReviewDate,
    sources: KB_META.sources,
    stats: {
      totalEntries: ARTICLES.length,
      byRegulation: ARTICLES.reduce((acc, a) => {
        acc[a.regulation] = (acc[a.regulation] || 0) + 1;
        return acc;
      }, {}),
    },
  });
});

/**
 * GET /api/v1/compliance/articles
 * Optional query params: domain, chapter (I–VI), regulation (DORA | DORA-RTS)
 */
export const listArticles = catchAsync(async (req, res) => {
  const { domain, chapter, regulation } = req.query;
  let articles = ARTICLES;

  if (regulation) {
    articles = articles.filter((a) => a.regulation === regulation);
  }

  if (domain) {
    articles = articles.filter((a) => a.domain === domain);
    if (articles.length === 0) {
      return sendError(res, 404, `No articles found for domain: ${domain}`);
    }
  }

  if (chapter) {
    const key = chapter.toUpperCase();
    const range = CHAPTER_RANGES[key];
    if (!range) {
      return sendError(
        res,
        400,
        `Invalid chapter "${chapter}". Valid values: ${Object.keys(CHAPTER_RANGES).join(', ')}`
      );
    }
    articles = articles.filter((a) => {
      const num = articleNumber(a.article);
      return num >= range[0] && num <= range[1];
    });
  }

  sendSuccess(res, 200, 'Articles retrieved', {
    total: articles.length,
    articles: articles.map((a) => ({
      regulation: a.regulation,
      article: a.article,
      title: a.title,
      domain: a.domain,
      obligations: a.obligations,
    })),
  });
});

/**
 * GET /api/v1/compliance/articles/:article
 * :article — "Article 30" URL-encoded, "Article-30" kebab, or RTS ID e.g. "RTS-RM-01"
 */
export const getArticle = catchAsync(async (req, res) => {
  const raw = decodeURIComponent(req.params.article).replace(/-/g, ' ').trim();

  const found = ARTICLES.find((a) => a.article.toLowerCase() === raw.toLowerCase());
  if (!found) {
    return sendError(res, 404, `Article not found: ${raw}`);
  }

  sendSuccess(res, 200, 'Article retrieved', { article: found });
});

/**
 * GET /api/v1/compliance/domains
 * Returns all domains with article counts, split by regulation type.
 */
export const listDomains = catchAsync(async (req, res) => {
  const domainMap = {};
  for (const a of ARTICLES) {
    if (!domainMap[a.domain]) {
      domainMap[a.domain] = {
        domain: a.domain,
        articleCount: 0,
        articles: [],
        regulationTypes: [],
      };
    }
    domainMap[a.domain].articleCount++;
    domainMap[a.domain].articles.push(a.article);
    if (!domainMap[a.domain].regulationTypes.includes(a.regulation)) {
      domainMap[a.domain].regulationTypes.push(a.regulation);
    }
  }

  sendSuccess(res, 200, 'Domains retrieved', {
    total: Object.keys(domainMap).length,
    domains: Object.values(domainMap),
  });
});
