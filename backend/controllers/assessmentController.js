import path from 'path';
import { Assessment } from '../models/Assessment.js';
import { assessmentQueue } from '../config/queue.js';
import { handleFileUpload } from '../middleware/fileUpload.js';
import { generateReport } from '../services/reportGenerator.js';
import { catchAsync, sendSuccess, sendError, AppError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * POST /api/v1/assessments
 *
 * Create a new assessment with uploaded vendor documents.
 * Enqueues fileIndex jobs for each file, then a gapAnalysis job.
 */
export const createAssessment = catchAsync(async (req, res) => {
  // Handle multipart file upload
  await handleFileUpload(req, res);

  const { name, vendorName, framework = 'DORA', workspaceId } = req.body;

  if (!name || !vendorName) {
    return sendError(res, 400, 'Assessment name and vendor name are required');
  }

  if (!workspaceId) {
    return sendError(res, 400, 'workspaceId is required');
  }

  if (!req.files || req.files.length === 0) {
    return sendError(res, 400, 'At least one vendor document must be uploaded');
  }

  const userId = req.user.userId;

  // Build document metadata array (without buffers — stored in jobs)
  const documents = req.files.map((f) => ({
    fileName: f.originalname,
    fileType: path.extname(f.originalname).replace('.', '').toLowerCase(),
    fileSize: f.size,
    status: 'uploading',
  }));

  // Create assessment record
  const assessment = await Assessment.create({
    workspaceId,
    name: name.trim(),
    vendorName: vendorName.trim(),
    framework,
    status: 'pending',
    statusMessage: 'Queued for processing…',
    documents,
    createdBy: userId,
  });

  logger.info('Assessment created', {
    service: 'assessment-controller',
    assessmentId: assessment._id,
    userId,
    fileCount: req.files.length,
  });

  // Enqueue a fileIndex job per uploaded file
  const fileJobs = req.files.map((file, i) =>
    assessmentQueue.add(
      'fileIndex',
      {
        assessmentId: assessment._id.toString(),
        documentIndex: i,
        // Convert buffer to array for JSON serialization across the queue
        buffer: { data: Array.from(file.buffer) },
        fileName: file.originalname,
        fileType: documents[i].fileType,
        vendorName: vendorName.trim(),
        userId,
      },
      {
        jobId: `fileIndex-${assessment._id}-${i}`,
        priority: 1,
      }
    )
  );

  // After all files are indexed, enqueue gap analysis
  // (worker handles this via a separate gapAnalysis job enqueued in Phase 3 controller)
  await Promise.all(fileJobs);

  // Enqueue gap analysis job that will run after all file jobs complete
  await assessmentQueue.add(
    'gapAnalysis',
    { assessmentId: assessment._id.toString(), userId },
    {
      jobId: `gapAnalysis-${assessment._id}`,
      delay: req.files.length * 5000, // rough delay; real coordination via job events
      priority: 2,
    }
  );

  logger.info('Assessment jobs enqueued', {
    service: 'assessment-controller',
    assessmentId: assessment._id,
    jobCount: req.files.length + 1,
  });

  sendSuccess(res, 201, 'Assessment created and queued for processing', {
    assessment: {
      _id: assessment._id,
      name: assessment.name,
      vendorName: assessment.vendorName,
      framework: assessment.framework,
      status: assessment.status,
      statusMessage: assessment.statusMessage,
      documents: assessment.documents,
      createdAt: assessment.createdAt,
    },
  });
});

/**
 * GET /api/v1/assessments
 *
 * List all assessments the user can see (scoped to their workspaces).
 */
export const listAssessments = catchAsync(async (req, res) => {
  const { workspaceId, status, page = 1, limit = 20 } = req.query;

  // Build the query — users can only see assessments in their authorized workspaces
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id) || [];

  const filter = { workspaceId: { $in: authorizedWorkspaceIds } };
  if (workspaceId) filter.workspaceId = workspaceId;
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [assessments, total] = await Promise.all([
    Assessment.find(filter)
      .select('-results.gaps') // exclude heavy gap details from list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Assessment.countDocuments(filter),
  ]);

  sendSuccess(res, 200, 'Assessments retrieved', {
    assessments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * GET /api/v1/assessments/:id
 *
 * Get a single assessment with full results.
 */
export const getAssessment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const assessment = await Assessment.findById(id).lean();

  if (!assessment) {
    throw new AppError('Assessment not found', 404);
  }

  // Workspace isolation check
  if (!authorizedWorkspaceIds.includes(assessment.workspaceId.toString())) {
    throw new AppError('Access denied to this assessment', 403);
  }

  sendSuccess(res, 200, 'Assessment retrieved', { assessment });
});

/**
 * GET /api/v1/assessments/:id/report
 *
 * Generate and download the DORA compliance report as a .docx file.
 */
export const downloadReport = catchAsync(async (req, res) => {
  const { id } = req.params;
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const assessment = await Assessment.findById(id).lean();

  if (!assessment) {
    throw new AppError('Assessment not found', 404);
  }

  if (!authorizedWorkspaceIds.includes(assessment.workspaceId.toString())) {
    throw new AppError('Access denied to this assessment', 403);
  }

  if (assessment.status !== 'complete') {
    return sendError(
      res,
      400,
      'Assessment is not yet complete. Please wait for analysis to finish.'
    );
  }

  const buffer = await generateReport(id);

  const safeVendorName = assessment.vendorName.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
  const dateStr = new Date().toISOString().slice(0, 10);
  const prefix = assessment.framework === 'CONTRACT_A30' ? 'ContractA30_Review' : 'DORA_Assessment';
  const filename = `${prefix}_${safeVendorName}_${dateStr}.docx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);

  logger.info('Report downloaded', {
    service: 'assessment-controller',
    assessmentId: id,
    userId: req.user.userId,
    filename,
  });

  res.end(buffer);
});

/**
 * DELETE /api/v1/assessments/:id
 *
 * Delete an assessment and its Qdrant collection.
 */
export const deleteAssessment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const assessment = await Assessment.findById(id);

  if (!assessment) {
    throw new AppError('Assessment not found', 404);
  }

  if (!authorizedWorkspaceIds.includes(assessment.workspaceId.toString())) {
    throw new AppError('Access denied to this assessment', 403);
  }

  if (assessment.createdBy !== userId.toString()) {
    throw new AppError('Only the creator can delete an assessment', 403);
  }

  // Clean up Qdrant collection (non-blocking)
  const { deleteAssessmentCollection } = await import('../services/fileIngestionService.js');
  deleteAssessmentCollection(id).catch((err) =>
    logger.warn('Failed to delete assessment Qdrant collection', {
      assessmentId: id,
      error: err.message,
    })
  );

  await Assessment.findByIdAndDelete(id);

  logger.info('Assessment deleted', { service: 'assessment-controller', assessmentId: id, userId });

  sendSuccess(res, 200, 'Assessment deleted');
});
