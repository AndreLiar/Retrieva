import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import { assessmentService } from '../services/AssessmentService.js';

const getAuthorizedIds = (req) => req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

export const createAssessment = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return sendError(res, 400, 'At least one vendor document must be uploaded');
  }
  const assessment = await assessmentService.createAssessment(
    req.user.userId,
    req.user.organizationId,
    req.body,
    req.files
  );
  sendSuccess(res, 201, 'Assessment created and queued for processing', { assessment });
});

export const listAssessments = catchAsync(async (req, res) => {
  const result = await assessmentService.listAssessments(getAuthorizedIds(req), req.query);
  sendSuccess(res, 200, 'Assessments retrieved', result);
});

export const getAssessment = catchAsync(async (req, res) => {
  const assessment = await assessmentService.getAssessment(req.params.id, getAuthorizedIds(req));
  sendSuccess(res, 200, 'Assessment retrieved', { assessment });
});

export const downloadReport = catchAsync(async (req, res) => {
  const { buffer, filename } = await assessmentService.getReportBuffer(
    req.params.id,
    req.user.userId,
    getAuthorizedIds(req)
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
});

export const setRiskDecision = catchAsync(async (req, res) => {
  const riskDecision = await assessmentService.setRiskDecision(
    req.params.id,
    req.user.userId,
    getAuthorizedIds(req),
    req.body
  );
  sendSuccess(res, 200, 'Risk decision recorded', { riskDecision });
});

export const setClauseSignoff = catchAsync(async (req, res) => {
  const clauseSignoffs = await assessmentService.setClauseSignoff(
    req.params.id,
    req.user.userId,
    getAuthorizedIds(req),
    req.body
  );
  sendSuccess(res, 200, 'Clause sign-off recorded', { clauseSignoffs });
});

export const downloadAssessmentFile = catchAsync(async (req, res) => {
  const { stream, fileName } = await assessmentService.getAssessmentFileDownload(
    req.params.id,
    req.params.docIndex,
    getAuthorizedIds(req)
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  stream.pipe(res);
});

export const deleteAssessment = catchAsync(async (req, res) => {
  await assessmentService.deleteAssessment(req.params.id, req.user.userId, getAuthorizedIds(req));
  sendSuccess(res, 200, 'Assessment deleted');
});
