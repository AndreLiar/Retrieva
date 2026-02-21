/**
 * File Ingestion Service
 *
 * Parses uploaded vendor documents (PDF, XLSX, DOCX) into text chunks
 * and indexes them into a per-assessment Qdrant collection.
 */

import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';
import { embeddings } from '../config/embeddings.js';
import logger from '../config/logger.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const VECTOR_SIZE = 1536; // text-embedding-3-small dimension

// Chunk config: ~600 chars with 100-char overlap
const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 100;

function getQdrantClient() {
  const options = { url: QDRANT_URL };
  if (QDRANT_API_KEY) options.apiKey = QDRANT_API_KEY;
  return new QdrantClient(options);
}

/**
 * Build a collection name for a given assessment.
 */
export function assessmentCollectionName(assessmentId) {
  return `assessment_${assessmentId}`;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

function parseXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      lines.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }
  }
  return lines.join('\n\n');
}

async function parseDocx(buffer) {
  // Use mammoth if available; fall back to raw XML extraction
  try {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch {
    // mammoth not installed — extract visible text from XML
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '';
    const xml = entry.getData().toString('utf8');
    return xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

/**
 * Dispatch to the correct parser based on file extension.
 */
export async function parseFile(buffer, fileType) {
  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer);
    case 'xlsx':
    case 'xls':
      return parseXlsx(buffer);
    case 'docx':
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping chunks at paragraph/sentence boundaries.
 */
export function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  // Normalize whitespace
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return [];

  // Split into paragraphs first
  const paragraphs = normalized.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      if (current) {
        chunks.push(current.trim());
        // Overlap: carry last `overlap` chars of current into next chunk
        const overlapText = current.slice(-overlap);
        current = overlapText ? `${overlapText}\n\n${para}` : para;
      } else {
        // Single paragraph larger than chunk size — split by sentence
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let sentBuf = '';
        for (const s of sentences) {
          const candidate2 = sentBuf ? `${sentBuf} ${s}` : s;
          if (candidate2.length <= chunkSize) {
            sentBuf = candidate2;
          } else {
            if (sentBuf) chunks.push(sentBuf.trim());
            sentBuf = s;
          }
        }
        if (sentBuf) current = sentBuf;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Filter out very short chunks (likely noise)
  return chunks.filter((c) => c.length > 30);
}

// ---------------------------------------------------------------------------
// Qdrant collection management
// ---------------------------------------------------------------------------

async function ensureAssessmentCollection(client, collectionName) {
  try {
    await client.getCollection(collectionName);
    logger.debug('Assessment Qdrant collection already exists', { collectionName });
  } catch {
    await client.createCollection(collectionName, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
      optimizers_config: { default_segment_number: 2 },
      replication_factor: 1,
    });
    logger.info('Created assessment Qdrant collection', { collectionName });
  }
}

export async function deleteAssessmentCollection(assessmentId) {
  const collectionName = assessmentCollectionName(assessmentId);
  try {
    const client = getQdrantClient();
    await client.deleteCollection(collectionName);
    logger.info('Deleted assessment Qdrant collection', { collectionName, assessmentId });
  } catch (err) {
    logger.warn('Could not delete assessment collection (may not exist)', {
      collectionName,
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Main indexing function
// ---------------------------------------------------------------------------

/**
 * Parse a file buffer, chunk it, embed, and store in Qdrant.
 *
 * @param {object} params
 * @param {Buffer}   params.buffer       - Raw file buffer
 * @param {string}   params.fileType     - 'pdf' | 'xlsx' | 'xls' | 'docx'
 * @param {string}   params.fileName     - Original filename (for metadata)
 * @param {string}   params.assessmentId - MongoDB Assessment _id (string)
 * @param {string}   params.vendorName   - Used in chunk metadata
 * @param {Function} [params.onProgress] - Called with { indexed, total }
 * @returns {Promise<{ chunkCount: number, collectionName: string }>}
 */
export async function ingestFile({
  buffer,
  fileType,
  fileName,
  assessmentId,
  vendorName,
  onProgress,
}) {
  logger.info('Starting file ingestion', {
    service: 'file-ingestion',
    fileName,
    fileType,
    assessmentId,
  });

  // 1. Parse
  const rawText = await parseFile(buffer, fileType);
  if (!rawText || rawText.trim().length < 10) {
    throw new Error(
      `Could not extract text from ${fileName}. The file may be empty or image-only.`
    );
  }

  // 2. Chunk
  const chunks = chunkText(rawText);
  if (chunks.length === 0) {
    throw new Error(`No usable text chunks found in ${fileName}.`);
  }

  logger.info('File parsed and chunked', {
    service: 'file-ingestion',
    fileName,
    rawLength: rawText.length,
    chunkCount: chunks.length,
  });

  // 3. Embed
  const vectors = await embeddings.embedDocuments(chunks, {
    onProgress: (batchNum, totalBatches, processed) => {
      if (onProgress) onProgress({ indexed: processed, total: chunks.length, phase: 'embedding' });
    },
  });

  // 4. Upsert to Qdrant (per-assessment collection)
  const collectionName = assessmentCollectionName(assessmentId);
  const client = getQdrantClient();
  await ensureAssessmentCollection(client, collectionName);

  const sanitize = (t) =>
    typeof t === 'string'
      ? t.replace(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
          '\uFFFD'
        )
      : t;

  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const batchVectors = vectors.slice(i, i + BATCH_SIZE);

    const points = batchChunks.map((chunk, j) => ({
      id: randomUUID(),
      vector: batchVectors[j],
      payload: {
        pageContent: sanitize(chunk),
        metadata: {
          assessmentId,
          vendorName,
          fileName,
          fileType,
          chunkIndex: i + j,
          totalChunks: chunks.length,
        },
      },
    }));

    await client.upsert(collectionName, { wait: true, points });
    upserted += batchChunks.length;

    if (onProgress) onProgress({ indexed: upserted, total: chunks.length, phase: 'indexing' });
  }

  logger.info('File ingestion complete', {
    service: 'file-ingestion',
    fileName,
    assessmentId,
    chunkCount: chunks.length,
    collectionName,
  });

  return { chunkCount: chunks.length, collectionName };
}

/**
 * Retrieve chunks from an assessment collection that are relevant to a query.
 *
 * @param {string} assessmentId
 * @param {string} queryText
 * @param {number} [topK=15]
 * @returns {Promise<Array<{ content: string, metadata: object, score: number }>>}
 */
export async function searchAssessmentChunks(assessmentId, queryText, topK = 15) {
  const collectionName = assessmentCollectionName(assessmentId);
  const client = getQdrantClient();

  const queryVector = await embeddings.embedQuery(queryText);

  const result = await client.search(collectionName, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });

  return result.map((hit) => ({
    content: hit.payload?.pageContent || '',
    metadata: hit.payload?.metadata || {},
    score: hit.score,
  }));
}
