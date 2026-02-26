import multer from 'multer';
import path from 'path';
import { AppError } from '../utils/index.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.docx']);

const MAX_FILE_SIZE_MB = 25;
const MAX_FILES_PER_UPLOAD = 5;

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new AppError(`Unsupported file type: ${ext}. Allowed: pdf, xlsx, xls, docx`, 400));
  }

  cb(null, true);
}

export const uploadAssessmentFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_FILES_PER_UPLOAD,
  },
}).array('files', MAX_FILES_PER_UPLOAD);

/**
 * Wraps multer's callback-style middleware into a Promise so it can be
 * used cleanly inside catchAsync route handlers.
 */
export function handleFileUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadAssessmentFiles(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return reject(new AppError(`File too large. Max size is ${MAX_FILE_SIZE_MB}MB`, 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return reject(
            new AppError(`Too many files. Max ${MAX_FILES_PER_UPLOAD} files per upload`, 400)
          );
        }
        return reject(new AppError(`Upload error: ${err.message}`, 400));
      }
      if (err) return reject(err);
      resolve();
    });
  });
}
