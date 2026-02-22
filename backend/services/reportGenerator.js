/**
 * Report Generator
 *
 * Converts a completed Assessment's gap analysis results into a
 * downloadable Microsoft Word (.docx) document.
 *
 * Structure:
 *  1. Cover page — vendor name, assessment date, overall risk rating
 *  2. Executive Summary
 *  3. Compliance Gap Analysis Table (per article)
 *  4. Domain Breakdown (one section per DORA domain)
 *  5. Methodology & Audit Trail
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
} from 'docx';
import { Assessment } from '../models/Assessment.js';
import { AppError } from '../utils/index.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const COLOUR = {
  primary: '1E3A5F', // dark navy — headers
  secondary: '2563EB', // blue — accents
  covered: 'D1FAE5', // green tint
  partial: 'FEF3C7', // amber tint
  missing: 'FEE2E2', // red tint
  tableHeader: '1E3A5F',
  tableHeaderText: 'FFFFFF',
  tableAlt: 'F8FAFC',
  border: 'E2E8F0',
  text: '1E293B',
  muted: '64748B',
};

const RISK_COLOUR = { High: 'DC2626', Medium: 'D97706', Low: '16A34A' };
const GAP_COLOUR = { covered: '16A34A', partial: 'D97706', missing: 'DC2626' };
const GAP_FILL = { covered: COLOUR.covered, partial: COLOUR.partial, missing: COLOUR.missing };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    run: { color: COLOUR.primary, bold: true },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    run: { color: COLOUR.primary },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: opts.size || 22,
        color: opts.color || COLOUR.text,
        bold: opts.bold || false,
        italics: opts.italics || false,
      }),
    ],
    spacing: { before: 100, after: 100 },
    alignment: opts.alignment || AlignmentType.LEFT,
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text || ''),
            size: 18,
            color: opts.textColor || COLOUR.text,
            bold: opts.bold || false,
          }),
        ],
        spacing: { before: 60, after: 60 },
      }),
    ],
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: opts.fill } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLOUR.border },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOUR.border },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLOUR.border },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLOUR.border },
    },
  });
}

function headerCell(text, width) {
  return cell(text, {
    fill: COLOUR.tableHeader,
    textColor: COLOUR.tableHeaderText,
    bold: true,
    width,
  });
}

function riskBadge(risk) {
  return new TextRun({
    text: ` ${risk} `,
    bold: true,
    color: COLOUR.tableHeaderText,
    highlight: risk === 'High' ? 'red' : risk === 'Medium' ? 'yellow' : 'green',
  });
}

function gapBadge(level) {
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return cell(label, {
    fill: GAP_FILL[level] || COLOUR.tableAlt,
    textColor: GAP_COLOUR[level] || COLOUR.text,
    bold: true,
    width: 10,
  });
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildCoverPage(assessment) {
  const risk = assessment.results?.overallRisk || 'N/A';
  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'DORA Compliance Assessment Report',
          bold: true,
          size: 56,
          color: COLOUR.primary,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: assessment.vendorName,
          bold: true,
          size: 36,
          color: COLOUR.secondary,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Overall Risk: `,
          size: 28,
          color: COLOUR.muted,
        }),
        riskBadge(risk),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Assessment: ${assessment.name}`,
          size: 24,
          color: COLOUR.muted,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}`,
          size: 22,
          color: COLOUR.muted,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Regulatory Framework: Regulation (EU) 2022/2554 (DORA)`,
          size: 20,
          color: COLOUR.muted,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
  ];
}

function buildExecutiveSummary(assessment) {
  const gaps = assessment.results?.gaps || [];
  const risk = assessment.results?.overallRisk || 'N/A';
  const summary = assessment.results?.summary || '';

  const covered = gaps.filter((g) => g.gapLevel === 'covered').length;
  const partial = gaps.filter((g) => g.gapLevel === 'partial').length;
  const missing = gaps.filter((g) => g.gapLevel === 'missing').length;

  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading1('Executive Summary'),
    para(
      summary ||
        `This report presents the results of a DORA compliance gap analysis for ${assessment.vendorName}.`
    ),
    new Paragraph({ spacing: { before: 200, after: 100 } }),
    heading2('Assessment Statistics'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell('Metric', 50), headerCell('Value', 50)],
        }),
        new TableRow({
          children: [
            cell('Overall Risk Rating', { width: 50 }),
            cell(risk, { width: 50, bold: true, textColor: RISK_COLOUR[risk] || COLOUR.text }),
          ],
        }),
        new TableRow({
          children: [
            cell('Total Obligations Assessed', { width: 50 }),
            cell(String(gaps.length), { width: 50 }),
          ],
        }),
        new TableRow({
          children: [
            cell('Covered', { width: 50, fill: COLOUR.tableAlt }),
            cell(String(covered), {
              width: 50,
              fill: COLOUR.tableAlt,
              textColor: GAP_COLOUR.covered,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell('Partial Coverage', { width: 50 }),
            cell(String(partial), { width: 50, textColor: GAP_COLOUR.partial }),
          ],
        }),
        new TableRow({
          children: [
            cell('Missing / Not Addressed', { width: 50, fill: COLOUR.tableAlt }),
            cell(String(missing), {
              width: 50,
              fill: COLOUR.tableAlt,
              textColor: GAP_COLOUR.missing,
            }),
          ],
        }),
      ],
    }),
  ];
}

function buildGapTable(assessment) {
  const gaps = assessment.results?.gaps || [];

  const rows = [
    new TableRow({
      children: [
        headerCell('Article', 12),
        headerCell('Domain', 15),
        headerCell('Requirement', 28),
        headerCell('Vendor Coverage', 25),
        headerCell('Gap Level', 10),
        headerCell('Recommendation', 10),
      ],
      tableHeader: true,
    }),
    ...gaps.map(
      (g, i) =>
        new TableRow({
          children: [
            cell(g.article, { width: 12, fill: i % 2 === 1 ? COLOUR.tableAlt : undefined }),
            cell(g.domain, { width: 15, fill: i % 2 === 1 ? COLOUR.tableAlt : undefined }),
            cell(g.requirement, { width: 28, fill: i % 2 === 1 ? COLOUR.tableAlt : undefined }),
            cell(g.vendorCoverage || '—', {
              width: 25,
              fill: i % 2 === 1 ? COLOUR.tableAlt : undefined,
            }),
            gapBadge(g.gapLevel),
            cell(g.recommendation || '—', {
              width: 10,
              fill: i % 2 === 1 ? COLOUR.tableAlt : undefined,
            }),
          ],
        })
    ),
  ];

  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading1('Compliance Gap Analysis'),
    para(
      `The following table maps each assessed DORA obligation to the evidence found in ${assessment.vendorName}'s documentation.`,
      { color: COLOUR.muted, italics: true }
    ),
    new Paragraph({ spacing: { before: 200 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  ];
}

function buildDomainBreakdown(assessment) {
  const gaps = assessment.results?.gaps || [];
  const domains = [...new Set(gaps.map((g) => g.domain))];
  const sections = [new Paragraph({ children: [new PageBreak()] }), heading1('Domain Breakdown')];

  for (const domain of domains) {
    const domainGaps = gaps.filter((g) => g.domain === domain);
    const counts = {
      covered: domainGaps.filter((g) => g.gapLevel === 'covered').length,
      partial: domainGaps.filter((g) => g.gapLevel === 'partial').length,
      missing: domainGaps.filter((g) => g.gapLevel === 'missing').length,
    };

    sections.push(
      heading2(domain),
      para(
        `${domainGaps.length} obligations assessed — ${counts.covered} covered, ${counts.partial} partial, ${counts.missing} missing.`,
        { color: COLOUR.muted }
      )
    );

    const priorityGaps = domainGaps.filter((g) => g.gapLevel !== 'covered').slice(0, 5);

    if (priorityGaps.length > 0) {
      sections.push(
        para('Priority gaps requiring attention:', { bold: true }),
        ...priorityGaps.map(
          (g) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: `• ${g.article}: `,
                  bold: true,
                  size: 20,
                  color: COLOUR.primary,
                }),
                new TextRun({
                  text: g.recommendation || g.requirement,
                  size: 20,
                  color: COLOUR.text,
                }),
              ],
              spacing: { before: 60, after: 60 },
              indent: { left: 360 },
            })
        )
      );
    }
  }

  return sections;
}

function buildMethodology(assessment) {
  const docs = assessment.documents || [];

  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading1('Methodology & Audit Trail'),
    heading2('Regulatory Framework'),
    para(
      'This assessment is based on Regulation (EU) 2022/2554 of the European Parliament and of the Council on digital operational resilience for the financial sector (DORA), applicable from 17 January 2025.',
      { color: COLOUR.text }
    ),
    heading2('Assessment Methodology'),
    para(
      'Vendor documentation was parsed and semantically indexed. Relevant content was extracted using vector similarity search across multiple compliance-focused query prompts. DORA obligations were retrieved from a pre-loaded regulatory knowledge base containing verbatim article texts. Gap assessment was performed using Azure OpenAI (gpt-4o-mini) function calling to produce structured, auditable output.',
      { color: COLOUR.text }
    ),
    heading2('Source Documents Analysed'),
    ...docs.map(
      (d) =>
        new Paragraph({
          children: [
            new TextRun({ text: `• ${d.fileName}`, size: 20, color: COLOUR.text }),
            new TextRun({
              text: ` (${d.fileType.toUpperCase()}, ${d.status})`,
              size: 18,
              color: COLOUR.muted,
            }),
          ],
          spacing: { before: 60, after: 60 },
          indent: { left: 360 },
        })
    ),
    heading2('Disclaimer'),
    para(
      'This report is generated by an automated AI-assisted compliance tool and should be reviewed by a qualified compliance professional before use in regulatory submissions or contractual negotiations. The analysis reflects the information available in the uploaded vendor documentation only.',
      { color: COLOUR.muted, italics: true }
    ),
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a DORA compliance report as a Buffer (.docx).
 *
 * @param {string} assessmentId - MongoDB Assessment _id
 * @returns {Promise<Buffer>} Word document buffer
 */
export async function generateReport(assessmentId) {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new AppError('Assessment not found', 404);
  if (assessment.status !== 'complete') {
    throw new AppError('Assessment must be complete before generating a report', 400);
  }

  logger.info('Generating DORA compliance report', {
    service: 'report-generator',
    assessmentId,
    vendorName: assessment.vendorName,
    gapCount: assessment.results?.gaps?.length || 0,
  });

  const doc = new Document({
    creator: 'Retrieva — DORA Compliance Platform',
    title: `DORA Assessment: ${assessment.vendorName}`,
    description: `Compliance gap analysis for ${assessment.vendorName} against Regulation (EU) 2022/2554`,
    sections: [
      {
        children: [
          ...buildCoverPage(assessment),
          ...buildExecutiveSummary(assessment),
          ...buildGapTable(assessment),
          ...buildDomainBreakdown(assessment),
          ...buildMethodology(assessment),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  logger.info('Report generated', {
    service: 'report-generator',
    assessmentId,
    sizeKb: Math.round(buffer.length / 1024),
  });

  return buffer;
}
