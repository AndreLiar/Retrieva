/**
 * Document conversion client (RTV-14 Phase 1 — Docling/Tier 2).
 *
 * Offloads document → Markdown conversion to the platform's in-cluster services
 * so ingestion is layout-aware and can OCR scanned pages, instead of the local
 * text-only parsers:
 *   - markitdown-proxy (ai ns :8000) — routes images → Docling OCR, and
 *     PDF/Office → MarkItDown (PyMuPDF: fast text + tables).
 *   - docling (ai ns :5001) — full layout + OCR; used directly as the OCR
 *     fallback for scanned / image-only PDFs (which PyMuPDF yields no text for).
 *
 * Governance: both targets are in the `ai` namespace and reachable only through
 * the backend-egress NetworkPolicy (ports 8000/5001). No direct external egress.
 * Feature-flagged via INGEST_USE_DOCLING so ingestion can fall back to the local
 * parsers instantly if the services are unavailable.
 */

import logger from './logger.js';

const MARKITDOWN_URL =
  process.env.MARKITDOWN_URL || 'http://markitdown-proxy.ai.svc.cluster.local:8000';
const DOCLING_URL = process.env.DOCLING_URL || 'http://docling.ai.svc.cluster.local:5001';
const USE_DOCLING = String(process.env.INGEST_USE_DOCLING ?? 'true').toLowerCase() !== 'false';
const CONVERT_TIMEOUT_MS = Number(process.env.INGEST_CONVERT_TIMEOUT_MS || 120000);

export function isDoclingEnabled() {
  return USE_DOCLING;
}

/**
 * POST a file buffer to a Docling-compatible /v1/convert/file endpoint and
 * return the extracted Markdown (`document.md_content`), or '' if none.
 *
 * @param {string} baseUrl   service base URL
 * @param {Buffer} buffer    raw file bytes
 * @param {string} fileName  original filename (drives server-side type routing)
 * @param {string} field     multipart field name ('file' for the proxy, 'files' for docling)
 */
async function postConvert(baseUrl, buffer, fileName, field) {
  const form = new FormData();
  form.append(field, new Blob([buffer]), fileName || 'document');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONVERT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/v1/convert/file`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`convert HTTP ${res.status}`);
    }
    const json = await res.json();
    const md = json?.document?.md_content;
    return typeof md === 'string' ? md : '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert via markitdown-proxy. Images are OCR'd (proxied to Docling); PDF/Office
 * are converted with MarkItDown/PyMuPDF (fast, low memory).
 */
export async function convertToMarkdown(buffer, fileName) {
  return postConvert(MARKITDOWN_URL, buffer, fileName, 'file');
}

/**
 * Convert via docling-serve directly (full layout + OCR). Used as the OCR
 * fallback for scanned / image-only PDFs. Docling's endpoint expects the
 * multipart field name `files`.
 */
export async function convertViaDocling(buffer, fileName) {
  return postConvert(DOCLING_URL, buffer, fileName, 'files');
}

logger.info('Document conversion configured', {
  service: 'document-conversion',
  useDocling: USE_DOCLING,
  markitdownUrl: MARKITDOWN_URL,
  doclingUrl: DOCLING_URL,
});
