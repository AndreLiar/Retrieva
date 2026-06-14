/**
 * translateComplianceKb.js
 *
 * Produces a WORKING (unofficial) French translation of the English DORA
 * knowledge base (`data/compliance/dora-articles.json`) →
 * `data/compliance/dora-articles.fr.json`, via the configured LLM.
 *
 * ⚠️ The output is a WORKING translation, NOT the official EUR-Lex text. Each
 * regulation citation keeps a link to the official text on EUR-Lex (set at
 * retrieval time). This file is explicitly flagged `official: false` so the seed
 * can tag chunks `metadata.official = false` and the UI can label them.
 *
 * Usage (from backend/):
 *   node scripts/translateComplianceKb.js            # translate all articles
 *   node scripts/translateComplianceKb.js --limit 2  # translate first N (smoke test)
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createLLM } from '../config/llmProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../data/compliance/dora-articles.json');
const OUT = path.join(__dirname, '../data/compliance/dora-articles.fr.json');

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

function parseJsonLoose(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function translateArticle(llm, article) {
  const payload = {
    title: article.title,
    domain: article.domain,
    text: article.text,
    obligations: article.obligations || [],
  };

  const prompt = [
    'You are a professional French legal translator. Translate the following DORA',
    '(Regulation (EU) 2022/2554) excerpt from English to French.',
    'Rules:',
    '- Translate meaning faithfully, in formal regulatory French.',
    '- Keep legal/article references intact (e.g. "Article 28", "ICT" -> "TIC",',
    '  "RTS", roman numerals, sub-paragraph letters like (a), (i)).',
    '- Return ONLY valid JSON with EXACTLY these keys: title, domain, text, obligations',
    '  (obligations is an array of strings). No commentary, no markdown fences.',
    '',
    'English JSON to translate:',
    JSON.stringify(payload),
  ].join('\n');

  const response = await llm.invoke(prompt);
  const content = typeof response === 'string' ? response : response.content;
  const fr = parseJsonLoose(content);

  return {
    regulation: article.regulation,
    article: article.article,
    title: fr.title || article.title,
    domain: fr.domain || article.domain,
    text: fr.text || article.text,
    obligations: Array.isArray(fr.obligations) ? fr.obligations : article.obligations || [],
  };
}

async function main() {
  const en = JSON.parse(readFileSync(SRC, 'utf-8'));
  const articles = en.articles.slice(0, LIMIT);
  const llm = await createLLM({ purpose: 'chat', temperature: 0, maxTokens: 2000 });

  console.log(`Translating ${articles.length} articles to French…`);

  const translated = [];
  for (let i = 0; i < articles.length; i++) {
    try {
      translated.push(await translateArticle(llm, articles[i]));

      console.log(
        `  [${i + 1}/${articles.length}] ${articles[i].regulation} ${articles[i].article} ✓`
      );
    } catch (err) {
      console.error(
        `  [${i + 1}/${articles.length}] ${articles[i].article} ✗ ${err.message} — keeping English`
      );
      translated.push(articles[i]);
    }
  }

  const out = {
    version: en.version,
    lang: 'fr',
    official: false,
    translatedFrom: 'en',
    translatedWith: 'llm-working-translation',
    disclaimer:
      'Traduction de travail non-officielle générée automatiquement. Le texte officiel et ' +
      'faisant foi est la version française publiée sur EUR-Lex.',
    sourceUrl: 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32022R2554',
    lastVerified: en.lastVerified,
    sources: en.sources || [],
    articles: translated,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  console.log(`Wrote ${translated.length} articles → ${OUT}`);
}

main().catch((err) => {
  console.error('Translation failed:', err);
  process.exit(1);
});
