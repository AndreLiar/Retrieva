/**
 * Unit Tests — Assessment Controller Handlers
 *
 * All dependencies are mocked so tests run without real DB/Redis/Qdrant.
 * Error cases: catchAsync catches AppError and passes to next() — we check
 * that next() was called with an Error (not that the handler rejects).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Set env vars before any imports
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// All mocks must be declared before importing the subject
// ---------------------------------------------------------------------------

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Make catchAsync return a real awaitable promise so tests can properly await handlers
vi.mock('../../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    catchAsync: (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        next(err);
      }
    },
  };
});

vi.mock('../../config/queue.js', () => ({
  assessmentQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

// Assessment model mock — vi.mock is hoisted, so this runs before any import
const mockAssessmentDoc = {
  _id: new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
  workspaceId: new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
  name: 'Test Assessment',
  vendorName: 'Acme',
  framework: 'DORA',
  status: 'pending',
  statusMessage: 'Queued…',
  documents: [],
  createdBy: 'user-abc',
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock('../../models/Assessment.js', () => ({
  Assessment: {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../middleware/fileUpload.js', () => ({
  handleFileUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/reportGenerator.js', () => ({
  generateReport: vi.fn().mockResolvedValue(Buffer.from('docx-bytes')),
}));

vi.mock('../../services/fileIngestionService.js', () => ({
  assessmentCollectionName: vi.fn((id) => `assessment_${id}`),
  deleteAssessmentCollection: vi.fn().mockResolvedValue(undefined),
  ingestFile: vi.fn().mockResolvedValue({ chunkCount: 10, collectionName: 'assessment_test' }),
  searchAssessmentChunks: vi.fn().mockResolvedValue([]),
  chunkText: vi.fn().mockReturnValue([]),
  parseFile: vi.fn().mockResolvedValue('parsed text'),
}));

// ---------------------------------------------------------------------------
// Subject imports
// ---------------------------------------------------------------------------

import {
  createAssessment,
  listAssessments,
  getAssessment,
  deleteAssessment,
} from '../../controllers/assessmentController.js';
import { Assessment } from '../../models/Assessment.js';
import { assessmentQueue } from '../../config/queue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_OID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ASSESSMENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

/** Build a thenable Query-like mock (supports .lean() chaining + direct await) */
function makeLeanQuery(resolvedValue) {
  const query = {
    lean: vi.fn().mockResolvedValue(resolvedValue),
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  return query;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assessmentController', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      user: { userId: 'user-abc' },
      authorizedWorkspaces: [{ _id: WORKSPACE_OID, workspaceName: 'Workspace A' }],
      body: {},
      params: {},
      query: {},
      files: [],
      ip: '127.0.0.1',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    mockNext = vi.fn();
  });

  // -------------------------------------------------------------------------
  // createAssessment
  // -------------------------------------------------------------------------
  describe('createAssessment', () => {
    beforeEach(() => {
      mockReq.body = {
        name: 'Q1 DORA Assessment',
        vendorName: 'Acme Corp',
        workspaceId: WORKSPACE_OID.toString(),
      };
      mockReq.files = [
        {
          originalname: 'policy.pdf',
          buffer: Buffer.from('pdf content'),
          size: 100,
          mimetype: 'application/pdf',
        },
      ];
      Assessment.create.mockResolvedValue(mockAssessmentDoc);
    });

    it('returns 400 when name is missing', async () => {
      mockReq.body.name = '';
      await createAssessment(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when vendorName is missing', async () => {
      mockReq.body.vendorName = '';
      await createAssessment(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when workspaceId is missing', async () => {
      delete mockReq.body.workspaceId;
      await createAssessment(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when no files are uploaded', async () => {
      mockReq.files = [];
      await createAssessment(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('creates assessment, enqueues fileIndex + gapAnalysis jobs, returns 201', async () => {
      await createAssessment(mockReq, mockRes, mockNext);

      expect(Assessment.create).toHaveBeenCalledOnce();
      // fileIndex job for each file
      expect(assessmentQueue.add).toHaveBeenCalledWith(
        'fileIndex',
        expect.objectContaining({ fileName: 'policy.pdf' }),
        expect.any(Object)
      );
      // gapAnalysis job
      expect(assessmentQueue.add).toHaveBeenCalledWith(
        'gapAnalysis',
        expect.objectContaining({ assessmentId: ASSESSMENT_ID }),
        expect.any(Object)
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('includes file buffer as array in fileIndex job payload', async () => {
      await createAssessment(mockReq, mockRes, mockNext);
      const fileIndexCall = assessmentQueue.add.mock.calls.find((c) => c[0] === 'fileIndex');
      expect(fileIndexCall).toBeDefined();
      expect(fileIndexCall[1]).toHaveProperty('buffer.data');
      expect(Array.isArray(fileIndexCall[1].buffer.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // listAssessments
  // -------------------------------------------------------------------------
  describe('listAssessments', () => {
    beforeEach(() => {
      const chainMock = makeLeanQuery([mockAssessmentDoc]);
      Assessment.find.mockReturnValue(chainMock);
      Assessment.countDocuments.mockResolvedValue(1);
    });

    it('returns 200 with assessments and pagination', async () => {
      await listAssessments(mockReq, mockRes, mockNext);
      expect(Assessment.find).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('filters by workspaceId when provided in query', async () => {
      mockReq.query.workspaceId = WORKSPACE_OID.toString();
      await listAssessments(mockReq, mockRes, mockNext);
      expect(Assessment.find).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WORKSPACE_OID.toString() })
      );
    });

    it('filters by status when provided in query', async () => {
      mockReq.query.status = 'complete';
      await listAssessments(mockReq, mockRes, mockNext);
      expect(Assessment.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
    });

    it('scopes query to authorized workspaces', async () => {
      await listAssessments(mockReq, mockRes, mockNext);
      const findCall = Assessment.find.mock.calls[0][0];
      // authorizedWorkspaces contains WORKSPACE_OID
      expect(findCall).toHaveProperty('workspaceId.$in');
      expect(findCall.workspaceId.$in).toContainEqual(WORKSPACE_OID);
    });
  });

  // -------------------------------------------------------------------------
  // getAssessment
  // -------------------------------------------------------------------------
  describe('getAssessment', () => {
    beforeEach(() => {
      mockReq.params.id = ASSESSMENT_ID;
    });

    it('returns 200 with the assessment when found and authorized', async () => {
      Assessment.findById.mockReturnValue(
        makeLeanQuery({ ...mockAssessmentDoc, workspaceId: WORKSPACE_OID })
      );
      await getAssessment(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('calls next with 404 error when assessment not found', async () => {
      Assessment.findById.mockReturnValue(makeLeanQuery(null));
      await getAssessment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Assessment not found' })
      );
    });

    it('calls next with 403 error when workspace not authorized', async () => {
      Assessment.findById.mockReturnValue(
        makeLeanQuery({
          ...mockAssessmentDoc,
          workspaceId: new mongoose.Types.ObjectId(), // different workspace
        })
      );
      await getAssessment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  // -------------------------------------------------------------------------
  // deleteAssessment
  // -------------------------------------------------------------------------
  describe('deleteAssessment', () => {
    beforeEach(() => {
      mockReq.params.id = ASSESSMENT_ID;
    });

    it('deletes the assessment and returns 200', async () => {
      Assessment.findById.mockResolvedValue({
        ...mockAssessmentDoc,
        workspaceId: WORKSPACE_OID,
        createdBy: 'user-abc',
      });
      Assessment.findByIdAndDelete.mockResolvedValue(mockAssessmentDoc);

      await deleteAssessment(mockReq, mockRes, mockNext);

      expect(Assessment.findByIdAndDelete).toHaveBeenCalledWith(ASSESSMENT_ID);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('calls next with 404 error when assessment not found', async () => {
      Assessment.findById.mockResolvedValue(null);
      await deleteAssessment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Assessment not found' })
      );
    });

    it('calls next with 403 error when caller is not the creator', async () => {
      Assessment.findById.mockResolvedValue({
        ...mockAssessmentDoc,
        workspaceId: WORKSPACE_OID,
        createdBy: 'another-user', // not mockReq.user.userId
      });
      await deleteAssessment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('calls next with 403 when workspace not authorized', async () => {
      Assessment.findById.mockResolvedValue({
        ...mockAssessmentDoc,
        workspaceId: new mongoose.Types.ObjectId(), // different workspace
        createdBy: 'user-abc',
      });
      await deleteAssessment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });
});
