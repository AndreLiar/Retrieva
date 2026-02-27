/**
 * Export Controller
 *
 * Handles on-demand report generation and download endpoints.
 */

import { catchAsync } from '../utils/index.js';
import { generateRoiWorkbook } from '../services/roiExportService.js';

/**
 * GET /api/v1/workspaces/roi-export
 *
 * Generates and streams a DORA Article 28(3) Register of Information XLSX
 * workbook for all workspaces accessible by the authenticated user.
 */
export const exportRoi = catchAsync(async (req, res) => {
  const buffer = await generateRoiWorkbook(req.user.userId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `DORA_Register_of_Information_${dateStr}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
});
