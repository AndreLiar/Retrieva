/**
 * Frontend Tests — Assessment Components
 *
 * Covers:
 *  - GapAnalysisTable: empty state, row rendering, expand/collapse, badges
 *  - AssessmentProgressStepper: all status variants, statusMessage
 *  - FileUploadZone: file list, remove handler, disabled state
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Gap } from '@/lib/api/assessments';

// ---------------------------------------------------------------------------
// react-dropzone mock — must be declared before component imports
// ---------------------------------------------------------------------------
vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(({ onDrop }: { onDrop?: (files: File[]) => void }) => ({
    getRootProps: () => ({
      onClick: vi.fn(),
      onDrop: onDrop ? (e: DragEvent) => {
        const dt = (e as unknown as React.DragEvent).dataTransfer;
        if (dt?.files) onDrop(Array.from(dt.files));
      } : vi.fn(),
    }),
    getInputProps: () => ({ type: 'file', style: { display: 'none' } }),
    isDragActive: false,
    fileRejections: [],
  })),
}));

import { GapAnalysisTable } from '@/components/assessment/GapAnalysisTable';
import { AssessmentProgressStepper } from '@/components/assessment/AssessmentProgressStepper';
import { FileUploadZone } from '@/components/assessment/FileUploadZone';
import React from 'react';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeGap = (overrides: Partial<Gap> = {}): Gap => ({
  article: 'Article 5',
  domain: 'ICT Risk Management',
  requirement: 'Maintain an updated ICT risk management framework',
  vendorCoverage: 'Mentioned briefly in section 2',
  gapLevel: 'partial',
  recommendation: 'Require formal documentation of ICT risk processes',
  sourceChunks: ['chunk-1', 'chunk-2'],
  ...overrides,
});

interface FileWithId extends File {
  id: string;
}
/** Create a File with the given byte size (uses Uint8Array to set actual content length) */
const makeFile = (name: string, sizeBytes = 7, type = 'application/pdf'): FileWithId => {
  const f = new File([new Uint8Array(sizeBytes)], name, { type }) as FileWithId;
  f.id = `${name}-0`;
  return f;
};

// ===========================================================================
// GapAnalysisTable
// ===========================================================================

describe('GapAnalysisTable', () => {
  it('renders "No gaps recorded" when gaps array is empty', () => {
    render(<GapAnalysisTable gaps={[]} />);
    expect(screen.getByText('No gaps recorded.')).toBeInTheDocument();
  });

  it('renders a row for each gap', () => {
    const gaps = [makeGap(), makeGap({ article: 'Article 6', domain: 'Third-Party Risk' })];
    render(<GapAnalysisTable gaps={gaps} />);
    expect(screen.getByText('Article 5')).toBeInTheDocument();
    expect(screen.getByText('Article 6')).toBeInTheDocument();
  });

  it('renders "Partial" badge for partial gap level', () => {
    render(<GapAnalysisTable gaps={[makeGap({ gapLevel: 'partial' })]} />);
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('renders "Missing" badge for missing gap level', () => {
    render(<GapAnalysisTable gaps={[makeGap({ gapLevel: 'missing' })]} />);
    expect(screen.getByText('Missing')).toBeInTheDocument();
  });

  it('renders "Covered" badge for covered gap level', () => {
    render(<GapAnalysisTable gaps={[makeGap({ gapLevel: 'covered' })]} />);
    expect(screen.getByText('Covered')).toBeInTheDocument();
  });

  it('detail row is hidden before clicking', () => {
    render(<GapAnalysisTable gaps={[makeGap()]} />);
    // Vendor coverage and recommendation only appear in expanded row
    expect(screen.queryByText('Vendor Coverage')).not.toBeInTheDocument();
  });

  it('expands detail row on row click', () => {
    render(<GapAnalysisTable gaps={[makeGap()]} />);
    const row = screen.getByText('Article 5').closest('tr')!;
    fireEvent.click(row);
    // 'Vendor Coverage' and 'Recommendation' are unique to the detail row
    expect(screen.getByText('Vendor Coverage')).toBeInTheDocument();
    expect(screen.getByText('Mentioned briefly in section 2')).toBeInTheDocument();
    expect(screen.getByText('Recommendation')).toBeInTheDocument();
    // 'Requirement' also appears as a table header, so verify at least 2 occurrences
    expect(screen.getAllByText('Requirement').length).toBeGreaterThanOrEqual(2);
  });

  it('collapses expanded detail row on second click', () => {
    render(<GapAnalysisTable gaps={[makeGap()]} />);
    const row = screen.getByText('Article 5').closest('tr')!;
    fireEvent.click(row);
    expect(screen.getByText('Vendor Coverage')).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByText('Vendor Coverage')).not.toBeInTheDocument();
  });

  it('shows evidence chunks section when sourceChunks is non-empty', () => {
    render(<GapAnalysisTable gaps={[makeGap({ sourceChunks: ['chunk-a'] })]} />);
    const row = screen.getByText('Article 5').closest('tr')!;
    fireEvent.click(row);
    expect(screen.getByText('Evidence chunks')).toBeInTheDocument();
    expect(screen.getByText('chunk-a')).toBeInTheDocument();
  });

  it('hides evidence section when sourceChunks is empty', () => {
    render(<GapAnalysisTable gaps={[makeGap({ sourceChunks: [] })]} />);
    const row = screen.getByText('Article 5').closest('tr')!;
    fireEvent.click(row);
    expect(screen.queryByText('Evidence chunks')).not.toBeInTheDocument();
  });

  it('can expand multiple rows independently', () => {
    const gaps = [
      makeGap({ article: 'Article 5', vendorCoverage: 'Coverage A' }),
      makeGap({ article: 'Article 6', vendorCoverage: 'Coverage B' }),
    ];
    render(<GapAnalysisTable gaps={gaps} />);

    fireEvent.click(screen.getByText('Article 5').closest('tr')!);
    expect(screen.getByText('Coverage A')).toBeInTheDocument();
    // Article 6 detail should not be visible yet
    expect(screen.queryByText('Coverage B')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Article 6').closest('tr')!);
    expect(screen.getByText('Coverage A')).toBeInTheDocument();
    expect(screen.getByText('Coverage B')).toBeInTheDocument();
  });
});

// ===========================================================================
// AssessmentProgressStepper
// ===========================================================================

describe('AssessmentProgressStepper', () => {
  it('renders all four step labels', () => {
    render(<AssessmentProgressStepper status="pending" />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Indexing')).toBeInTheDocument();
    expect(screen.getByText('Analyzing')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders all step descriptions', () => {
    render(<AssessmentProgressStepper status="pending" />);
    expect(screen.getByText('Assessment created')).toBeInTheDocument();
    expect(screen.getByText('Parsing & embedding documents')).toBeInTheDocument();
    expect(screen.getByText('Running DORA gap analysis')).toBeInTheDocument();
    expect(screen.getByText('Report ready')).toBeInTheDocument();
  });

  it('does not render statusMessage when not provided', () => {
    const { container } = render(<AssessmentProgressStepper status="pending" />);
    // The status message paragraph should not exist
    const paragraphs = container.querySelectorAll('p');
    // Only description paragraphs inside the step list
    paragraphs.forEach((p) => {
      expect(p.textContent).not.toBe('');
    });
  });

  it('renders statusMessage when provided', () => {
    render(<AssessmentProgressStepper status="indexing" statusMessage="Processing file 1 of 3" />);
    expect(screen.getByText('Processing file 1 of 3')).toBeInTheDocument();
  });

  it('renders statusMessage in destructive color when status is failed', () => {
    render(<AssessmentProgressStepper status="failed" statusMessage="Analysis failed" />);
    const msg = screen.getByText('Analysis failed');
    expect(msg).toBeInTheDocument();
    expect(msg.className).toContain('destructive');
  });

  it('renders four steps for "complete" status without errors', () => {
    render(<AssessmentProgressStepper status="complete" />);
    // Should render without crashing
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('renders four steps for "failed" status without errors', () => {
    render(<AssessmentProgressStepper status="failed" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('renders four steps for "analyzing" status without errors', () => {
    render(<AssessmentProgressStepper status="analyzing" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});

// ===========================================================================
// FileUploadZone
// ===========================================================================

describe('FileUploadZone', () => {
  it('renders dropzone with instruction text when no files', () => {
    render(<FileUploadZone files={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText('Drag & drop vendor documents here, or click to browse')
    ).toBeInTheDocument();
  });

  it('renders file acceptance hint text', () => {
    render(<FileUploadZone files={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/PDF, XLSX, XLS, DOCX/)).toBeInTheDocument();
    expect(screen.getByText(/max 25MB/)).toBeInTheDocument();
  });

  it('renders uploaded files in the list', () => {
    const files = [makeFile('policy.pdf'), makeFile('contract.docx', 2048, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')];
    render(<FileUploadZone files={files} onChange={vi.fn()} />);
    expect(screen.getByText('policy.pdf')).toBeInTheDocument();
    expect(screen.getByText('contract.docx')).toBeInTheDocument();
  });

  it('shows formatted file size in KB', () => {
    const files = [makeFile('report.pdf', 1536)]; // 1536 bytes = 1.5 KB
    render(<FileUploadZone files={files} onChange={vi.fn()} />);
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
  });

  it('calls onChange with file removed when remove button clicked', () => {
    const onChange = vi.fn();
    const files = [makeFile('policy.pdf'), makeFile('contract.docx')];
    render(<FileUploadZone files={files} onChange={onChange} />);
    // Get all remove buttons (X icons) — there should be one per file
    const removeButtons = screen.getAllByRole('button');
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const newFiles = onChange.mock.calls[0][0];
    expect(newFiles).toHaveLength(1);
    expect(newFiles[0].name).toBe('contract.docx');
  });

  it('shows size in MB for large files', () => {
    const files = [makeFile('big.pdf', 1024 * 1024)]; // exactly 1 MB
    render(<FileUploadZone files={files} onChange={vi.fn()} />);
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('does not render file list when no files provided', () => {
    render(<FileUploadZone files={[]} onChange={vi.fn()} />);
    // No list items
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
