/**
 * parseFile routing (RTV-14 Phase 1 — Docling ingestion).
 * Verifies images → OCR, PDF → markitdown-proxy then Docling-OCR fallback then
 * local pdf-parse, and that xlsx stays on the local parser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

// Mocks must be hoisted so the module factories can reference them.
const { convertToMarkdown, convertViaDocling, state, pdfParse } = vi.hoisted(() => ({
  convertToMarkdown: vi.fn(),
  convertViaDocling: vi.fn(),
  pdfParse: vi.fn(),
  state: { docling: true },
}));

vi.mock('../../config/documentConversion.js', () => ({
  convertToMarkdown,
  convertViaDocling,
  isDoclingEnabled: () => state.docling,
}));
vi.mock('pdf-parse', () => ({ default: pdfParse }));
vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { parseFile } = await import('../../services/fileIngestionService.js');

const buf = Buffer.from('binary');

beforeEach(() => {
  vi.clearAllMocks();
  state.docling = true;
});

describe('parseFile — images (OCR only)', () => {
  it('routes an image through the conversion service and returns its markdown', async () => {
    convertToMarkdown.mockResolvedValue('# Chart\nrevenue rose 20%');
    const out = await parseFile(buf, 'png', 'chart.png');
    expect(out).toBe('# Chart\nrevenue rose 20%');
    expect(convertToMarkdown).toHaveBeenCalledOnce();
    expect(convertViaDocling).not.toHaveBeenCalled();
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it('returns empty string when the image has no extractable text', async () => {
    convertToMarkdown.mockResolvedValue('');
    expect(await parseFile(buf, 'jpg', 'blank.jpg')).toBe('');
  });
});

describe('parseFile — pdf', () => {
  it('uses markitdown-proxy text when it is sufficient (no OCR, no local parse)', async () => {
    convertToMarkdown.mockResolvedValue('This is a long text-based PDF with real content.');
    const out = await parseFile(buf, 'pdf', 'doc.pdf');
    expect(out).toContain('real content');
    expect(convertViaDocling).not.toHaveBeenCalled();
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it('falls back to Docling OCR when markitdown yields no usable text (scanned PDF)', async () => {
    convertToMarkdown.mockResolvedValue('   '); // PyMuPDF found nothing → scanned
    convertViaDocling.mockResolvedValue('OCR-extracted text from the scanned pages.');
    const out = await parseFile(buf, 'pdf', 'scanned.pdf');
    expect(out).toContain('OCR-extracted');
    expect(convertViaDocling).toHaveBeenCalledOnce();
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it('falls back to local pdf-parse when the conversion services error', async () => {
    convertToMarkdown.mockRejectedValue(new Error('ECONNREFUSED'));
    pdfParse.mockResolvedValue({ text: 'local pdf-parse text output' });
    const out = await parseFile(buf, 'pdf', 'doc.pdf');
    expect(out).toBe('local pdf-parse text output');
    expect(pdfParse).toHaveBeenCalledOnce();
  });

  it('uses local pdf-parse directly when Docling is disabled', async () => {
    state.docling = false;
    pdfParse.mockResolvedValue({ text: 'local only' });
    const out = await parseFile(buf, 'pdf', 'doc.pdf');
    expect(out).toBe('local only');
    expect(convertToMarkdown).not.toHaveBeenCalled();
  });
});

describe('parseFile — xlsx stays local (no conversion service)', () => {
  it('parses a spreadsheet locally and never calls the conversion service', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['vendor', 'risk'],
      ['acme', 'high'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const out = await parseFile(xlsxBuf, 'xlsx', 'vendors.xlsx');
    expect(out).toContain('vendor');
    expect(out).toContain('acme');
    expect(convertToMarkdown).not.toHaveBeenCalled();
  });
});

describe('parseFile — unsupported type', () => {
  it('throws on an unknown extension', async () => {
    await expect(parseFile(buf, 'zip', 'x.zip')).rejects.toThrow(/Unsupported file type/);
  });
});
