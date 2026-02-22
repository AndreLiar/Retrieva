/**
 * Compliance Controller
 *
 * Serves DORA article reference data from the static compliance knowledge base.
 * Articles are loaded once at startup from dora-articles.json.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load static reference data once at module initialization
const ARTICLES = JSON.parse(
  readFileSync(path.join(__dirname, '../data/compliance/dora-articles.json'), 'utf-8')
);

// DORA chapter → article number range
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
 * GET /api/v1/compliance/articles
 * Optional query params: domain, chapter (I–VI)
 */
export const listArticles = catchAsync(async (req, res) => {
  const { domain, chapter } = req.query;
  let articles = ARTICLES;

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
 * :article — "Article 30" URL-encoded or "Article-30" kebab form
 */
export const getArticle = catchAsync(async (req, res) => {
  // Accept "Article-30" (kebab) or "Article%2030" (URL-encoded space)
  const raw = decodeURIComponent(req.params.article).replace(/-/g, ' ').trim();

  const found = ARTICLES.find((a) => a.article.toLowerCase() === raw.toLowerCase());
  if (!found) {
    return sendError(res, 404, `Article not found: ${raw}`);
  }

  sendSuccess(res, 200, 'Article retrieved', { article: found });
});

/**
 * GET /api/v1/compliance/domains
 * Returns all domains with article counts.
 */
export const listDomains = catchAsync(async (req, res) => {
  const domainMap = {};
  for (const a of ARTICLES) {
    if (!domainMap[a.domain]) {
      domainMap[a.domain] = { domain: a.domain, articleCount: 0, articles: [] };
    }
    domainMap[a.domain].articleCount++;
    domainMap[a.domain].articles.push(a.article);
  }

  sendSuccess(res, 200, 'Domains retrieved', {
    total: Object.keys(domainMap).length,
    domains: Object.values(domainMap),
  });
});
