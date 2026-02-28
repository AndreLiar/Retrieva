/**
 * RoI Export Service
 *
 * Generates an EBA-compliant DORA Article 28(3) Register of Information
 * workbook (XLSX) for all workspaces accessible by the requesting user.
 *
 * Sheets produced:
 *   RT.01.01 — Summary (entity-level metadata)
 *   RT.02.01 — ICT Third-Party Service Providers (one row per workspace/vendor)
 *   RT.03.01 — Certifications (one row per cert per vendor)
 *   RT.04.01 — Gap Summary (one row per gap from latest complete assessment)
 */

import XLSX from 'xlsx';
import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Assessment } from '../models/Assessment.js';
import { VendorQuestionnaire } from '../models/VendorQuestionnaire.js';

const INSTITUTION_NAME = process.env.INSTITUTION_NAME || 'Financial Entity';

function fmtDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function generateRoiWorkbook(userId) {
  // 1. Collect all workspaces the user has access to
  const memberships = await WorkspaceMember.find({ userId, status: 'active' });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

  // 2. Latest complete assessment per workspace
  const latestAssessments = await Assessment.aggregate([
    { $match: { workspaceId: { $in: workspaceIds }, status: 'complete' } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$workspaceId', doc: { $first: '$$ROOT' } } },
  ]);

  // 3. Latest complete questionnaire per workspace
  const latestQuestionnaires = await VendorQuestionnaire.aggregate([
    { $match: { workspaceId: { $in: workspaceIds }, status: 'complete' } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$workspaceId', doc: { $first: '$$ROOT' } } },
  ]);

  // O(1) lookup maps
  const assessmentMap = Object.fromEntries(latestAssessments.map((a) => [a._id.toString(), a.doc]));
  const questionnaireMap = Object.fromEntries(
    latestQuestionnaires.map((q) => [q._id.toString(), q.doc])
  );

  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------------------
  // Sheet 1: RT.01.01 — Summary
  // -------------------------------------------------------------------------
  const summaryRows = [
    ['EBA DORA Register of Information — RT.01.01 Summary'],
    [],
    ['Institution Name', INSTITUTION_NAME],
    ['Report Generated', new Date().toISOString()],
    ['Total Vendors', workspaces.length],
    ['Critical Vendors', workspaces.filter((w) => w.vendorTier === 'critical').length],
    ['Important Vendors', workspaces.filter((w) => w.vendorTier === 'important').length],
    ['Standard Vendors', workspaces.filter((w) => w.vendorTier === 'standard').length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'RT.01.01 Summary');

  // -------------------------------------------------------------------------
  // Sheet 2: RT.02.01 — ICT Third-Party Service Providers
  // -------------------------------------------------------------------------
  const providersHeader = [
    'B_01.01.0010 Institution Name',
    'B_01.02.0030 Vendor Name',
    'B_01.02.0040 Country',
    'B_01.02.0060 ICT Function Categories',
    'B_01.02.0080 Service Type',
    'B_01.02.0090 Contract Start',
    'B_01.02.0100 Contract End',
    'B_01.02.0110 Criticality Tier',
    'B_01.02.0120 Vendor Status',
    'B_01.02.0130 Questionnaire Score',
    'B_01.02.0140 Assessment Risk',
    'B_01.02.0150 Next Review Date',
  ];

  const providersRows = [providersHeader];
  for (const ws of workspaces) {
    const wsId = ws._id.toString();
    const assessment = assessmentMap[wsId];
    const questionnaire = questionnaireMap[wsId];

    providersRows.push([
      INSTITUTION_NAME,
      ws.name,
      ws.country || '',
      (ws.vendorFunctions ?? []).join('; '),
      ws.serviceType || '',
      fmtDate(ws.contractStart),
      fmtDate(ws.contractEnd),
      ws.vendorTier || '',
      ws.vendorStatus || '',
      questionnaire?.overallScore !== null && questionnaire?.overallScore !== undefined
        ? questionnaire.overallScore
        : '',
      assessment?.results?.overallRisk || '',
      fmtDate(ws.nextReviewDate),
    ]);
  }
  const wsProviders = XLSX.utils.aoa_to_sheet(providersRows);
  XLSX.utils.book_append_sheet(wb, wsProviders, 'RT.02.01 ICT Providers');

  // -------------------------------------------------------------------------
  // Sheet 3: RT.03.01 — Certifications
  // -------------------------------------------------------------------------
  const certsHeader = ['Vendor Name', 'Certification Type', 'Valid Until', 'Status'];
  const certsRows = [certsHeader];
  for (const ws of workspaces) {
    if (!ws.certifications?.length) {
      certsRows.push([ws.name, '', '', '']);
      continue;
    }
    for (const cert of ws.certifications) {
      certsRows.push([ws.name, cert.type, fmtDate(cert.validUntil), cert.status]);
    }
  }
  const wsCerts = XLSX.utils.aoa_to_sheet(certsRows);
  XLSX.utils.book_append_sheet(wb, wsCerts, 'RT.03.01 Certifications');

  // -------------------------------------------------------------------------
  // Sheet 4: RT.04.01 — Gap Summary
  // -------------------------------------------------------------------------
  const gapsHeader = [
    'Vendor Name',
    'Article',
    'Domain',
    'Requirement',
    'Gap Level',
    'Recommendation',
  ];
  const gapsRows = [gapsHeader];
  for (const ws of workspaces) {
    const wsId = ws._id.toString();
    const assessment = assessmentMap[wsId];
    const gaps = assessment?.results?.gaps;

    if (!gaps?.length) {
      gapsRows.push([ws.name, '', '', '', '', '']);
      continue;
    }
    for (const gap of gaps) {
      gapsRows.push([
        ws.name,
        gap.article || '',
        gap.domain || '',
        gap.requirement || '',
        gap.gapLevel || '',
        gap.recommendation || '',
      ]);
    }
  }
  const wsGaps = XLSX.utils.aoa_to_sheet(gapsRows);
  XLSX.utils.book_append_sheet(wb, wsGaps, 'RT.04.01 Gap Summary');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}
