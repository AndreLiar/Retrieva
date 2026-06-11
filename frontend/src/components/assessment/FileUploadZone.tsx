'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { Upload, X, FileText, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_SIZE_MB = 25;
const MAX_FILES = 5;

interface FileWithPreview extends File {
  id: string;
  category?: string;
}

interface CategoryOption {
  value: string;
  label: string;
}

interface FileUploadZoneProps {
  files: FileWithPreview[];
  onChange: (files: FileWithPreview[]) => void;
  // When provided, each file row shows a category dropdown (issue #395 tagging).
  categories?: CategoryOption[];
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="h-4 w-4 text-red-500" />;
  if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  return <FileText className="h-4 w-4 text-blue-500" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadZone({ files, onChange, categories }: FileUploadZoneProps) {
  const { t } = useTranslation();

  const setCategory = (id: string, category: string) => {
    onChange(files.map((f) => (f.id === id ? Object.assign(f, { category }) : f)));
  };
  const onDrop = useCallback(
    (accepted: File[]) => {
      const withId = accepted.map((f) =>
        Object.assign(f, { id: `${f.name}-${f.lastModified}` })
      ) as FileWithPreview[];
      const merged = [...files, ...withId].slice(0, MAX_FILES);
      onChange(merged);
    },
    [files, onChange]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE_MB * 1024 * 1024,
    maxFiles: MAX_FILES - files.length,
    disabled: files.length >= MAX_FILES,
  });

  const removeFile = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
          files.length >= MAX_FILES && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        {isDragActive ? (
          <p className="text-sm font-medium text-primary">{t('assessments.upload.drop')}</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {t('assessments.upload.prompt')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('assessments.upload.hint', { size: MAX_SIZE_MB, count: MAX_FILES })}
            </p>
          </>
        )}
      </div>

      {fileRejections.length > 0 && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2 space-y-1">
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name}>
              <span className="font-medium">{file.name}:</span>{' '}
              {errors.map((e) => e.message).join(', ')}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <FileIcon name={file.name} />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              {categories && categories.length > 0 && (
                <select
                  value={file.category ?? ''}
                  onChange={(e) => setCategory(file.id, e.target.value)}
                  aria-label={t('assessments.form.recommendedDocs.categoryPlaceholder')}
                  className="shrink-0 max-w-[45%] rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <option value="">
                    {t('assessments.form.recommendedDocs.categoryPlaceholder')}
                  </option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => removeFile(file.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
