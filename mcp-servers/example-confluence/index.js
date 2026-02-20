/**
 * Retrieva MCP Server — Confluence Example
 *
 * This is a reference implementation that shows how to expose a data source
 * (Confluence in this case) to Retrieva using the Model Context Protocol.
 *
 * Retrieva connects to this server as an MCP client and calls the tools below
 * to discover and fetch documents for indexing into its vector store.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CONTRACT: Tools this server must expose
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  get_source_info   → { name, type, totalDocuments, description }
 *  list_documents    → [{ id, title, url, lastModified, type, parentId? }]
 *  fetch_document    → { id, title, url, content (markdown), contentHash,
 *                        createdAt, lastModified, author?, properties? }
 *  get_changes       → [{ id, changeType: 'created'|'modified'|'deleted' }]
 *                       (argument: { since: ISO-8601 string })
 *
 * All tools return JSON encoded as a text MCP content block.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Configuration (environment variables)
 * ──────────────────────────────────────────────────────────────────────────────
 *  PORT                     HTTP port (default 3100)
 *  MCP_AUTH_TOKEN           Secret that Retrieva must send as Bearer token
 *  CONFLUENCE_BASE_URL      e.g. https://company.atlassian.net
 *  CONFLUENCE_USERNAME      Atlassian account email
 *  CONFLUENCE_API_TOKEN     Atlassian API token (not password)
 *  CONFLUENCE_SPACE_KEY     Space to expose (e.g. ENG). Omit for all spaces.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Usage
 * ──────────────────────────────────────────────────────────────────────────────
 *  npm install
 *  MCP_AUTH_TOKEN=my-secret node index.js
 *
 * Then register in Retrieva:
 *  POST /api/v1/mcp-sources
 *  { "name": "Confluence - Engineering", "sourceType": "confluence",
 *    "serverUrl": "http://localhost:3100/mcp", "authToken": "my-secret" }
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createHash } from 'crypto';
import { z } from 'zod';

const PORT = parseInt(process.env.PORT) || 3100;
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || null;

// ---------------------------------------------------------------------------
// Confluence API client (thin wrapper over the REST API v2)
// ---------------------------------------------------------------------------

const CONFLUENCE_BASE = process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, '') ?? '';
const CONFLUENCE_AUTH = Buffer.from(
  `${process.env.CONFLUENCE_USERNAME}:${process.env.CONFLUENCE_API_TOKEN}`
).toString('base64');
const SPACE_KEY = process.env.CONFLUENCE_SPACE_KEY ?? null;

async function confluenceFetch(path) {
  const url = `${CONFLUENCE_BASE}/wiki/rest/api${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${CONFLUENCE_AUTH}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Confluence API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Convert Confluence storage format body to readable markdown (simplified). */
function bodyToMarkdown(body) {
  if (!body) return '';
  const raw = body.storage?.value ?? body.view?.value ?? '';
  // Strip HTML tags (good enough for searchable text; a real impl would use a proper parser)
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// MCP Tool implementations
// ---------------------------------------------------------------------------

async function toolGetSourceInfo() {
  let total = 0;
  try {
    const params = SPACE_KEY
      ? `?spaceKey=${SPACE_KEY}&type=page&limit=1`
      : '?type=page&limit=1';
    const data = await confluenceFetch(`/content${params}`);
    total = data.size ?? 0;
  } catch (_) {
    // non-critical
  }

  return {
    name: SPACE_KEY ? `Confluence Space: ${SPACE_KEY}` : 'Confluence (all spaces)',
    type: 'confluence',
    totalDocuments: total,
    description: `Confluence pages exposed via MCP from ${CONFLUENCE_BASE}`,
  };
}

async function toolListDocuments() {
  const results = [];
  let start = 0;
  const limit = 50;

  while (true) {
    const spaceFilter = SPACE_KEY ? `spaceKey=${SPACE_KEY}&` : '';
    const data = await confluenceFetch(
      `/content?${spaceFilter}type=page&status=current&expand=version,ancestors&start=${start}&limit=${limit}`
    );

    for (const page of data.results ?? []) {
      results.push({
        id: page.id,
        title: page.title,
        url: `${CONFLUENCE_BASE}/wiki${page._links?.webui ?? ''}`,
        lastModified: page.version?.when ?? null,
        type: 'page',
        parentId: page.ancestors?.at(-1)?.id ?? null,
      });
    }

    if (data.size < limit || !data._links?.next) break;
    start += limit;
  }

  return results;
}

async function toolFetchDocument(documentId) {
  const page = await confluenceFetch(
    `/content/${documentId}?expand=body.storage,version,ancestors,space`
  );

  const content = bodyToMarkdown(page.body);

  return {
    id: page.id,
    title: page.title,
    url: `${CONFLUENCE_BASE}/wiki${page._links?.webui ?? ''}`,
    content,
    contentHash: hashContent(content),
    createdAt: page.history?.createdDate ?? null,
    lastModified: page.version?.when ?? null,
    author: page.version?.by?.displayName ?? null,
    parentId: page.ancestors?.at(-1)?.id ?? null,
    parentType: page.ancestors?.length > 0 ? 'page' : 'space',
    properties: {
      spaceKey: page.space?.key,
      spaceTitle: page.space?.name,
      version: page.version?.number,
    },
  };
}

async function toolGetChanges(since) {
  const sinceDate = since ? new Date(since) : new Date(0);
  const changes = [];

  const spaceFilter = SPACE_KEY ? `spaceKey=${SPACE_KEY}&` : '';
  const data = await confluenceFetch(
    `/content?${spaceFilter}type=page&status=current&expand=version&limit=100`
  );

  for (const page of data.results ?? []) {
    const modifiedAt = page.version?.when ? new Date(page.version.when) : null;
    if (modifiedAt && modifiedAt > sinceDate) {
      changes.push({ id: page.id, changeType: 'modified' });
    }
  }

  // Note: Confluence doesn't expose deletions via this API; a real impl would
  // compare against the stored document list to detect removals.
  return changes;
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

function createMCPServer() {
  const server = new McpServer({
    name: 'retrieva-confluence-mcp',
    version: '1.0.0',
  });

  server.tool('get_source_info', 'Return metadata about this data source', {}, async () => {
    const result = await toolGetSourceInfo();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  server.tool(
    'list_documents',
    'List all available documents with lightweight metadata',
    {},
    async () => {
      const result = await toolListDocuments();
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'fetch_document',
    'Fetch the full content of a single document by ID',
    { document_id: z.string().describe('The document ID') },
    async ({ document_id }) => {
      const result = await toolFetchDocument(document_id);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'get_changes',
    'Return documents that changed since a given ISO-8601 timestamp',
    { since: z.string().describe('ISO-8601 timestamp') },
    async ({ since }) => {
      const result = await toolGetChanges(since);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP server with Bearer auth guard
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

/** Middleware: enforce Bearer token if MCP_AUTH_TOKEN is set */
function authGuard(req, res, next) {
  if (!AUTH_TOKEN) return next();

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/mcp', authGuard, async (req, res) => {
  const server = createMCPServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  res.on('close', () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'retrieva-mcp-confluence' });
});

app.listen(PORT, () => {
  console.log(`Retrieva MCP Confluence server running on http://localhost:${PORT}/mcp`);
  console.log(`Auth: ${AUTH_TOKEN ? 'Bearer token required' : 'DISABLED (set MCP_AUTH_TOKEN)'}`);
  console.log(`Source: ${CONFLUENCE_BASE || '(CONFLUENCE_BASE_URL not set)'}`);
});
