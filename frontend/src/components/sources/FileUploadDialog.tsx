'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sourcesApi } from '@/lib/api/sources';

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

const MAX_MB = 25;
const ACCEPTED = '.pdf,.docx,.xlsx,.xls';
const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

export function FileUploadDialog({ open, onOpenChange, workspaceId }: FileUploadDialogProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      sourcesApi.create({
        name: name.trim(),
        workspaceId,
        sourceType: 'file',
        file: file!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources', workspaceId] });
      handleClose();
    },
  });

  function handleClose() {
    setName('');
    setFile(null);
    setFileError('');
    onOpenChange(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(null);
    setFileError('');

    if (!selected) return;

    if (selected.size > MAX_MB * 1024 * 1024) {
      setFileError(`File too large. Max size is ${MAX_MB} MB.`);
      return;
    }
    if (!ACCEPTED_MIME.has(selected.type)) {
      setFileError('Unsupported file type. Allowed: PDF, DOCX, XLSX.');
      return;
    }

    setFile(selected);
    if (!name) setName(selected.name.replace(/\.[^/.]+$/, ''));
  }

  const canSubmit = name.trim().length > 0 && !!file && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !mutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload a PDF, DOCX, or XLSX document to index into the knowledge base. Max {MAX_MB} MB.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Source name */}
          <div className="grid gap-1.5">
            <Label htmlFor="ds-file-name">Source name</Label>
            <Input
              id="ds-file-name"
              placeholder="e.g. DORA Policy v2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          {/* File picker */}
          <div className="grid gap-1.5">
            <Label htmlFor="ds-file-upload">File</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click to select a file, or drag &amp; drop
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">PDF · DOCX · XLSX · up to {MAX_MB} MB</p>
            </div>
            <input
              id="ds-file-upload"
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={handleFileChange}
            />
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as Error)?.message ?? 'Upload failed. Please try again.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
          >
            {mutation.isPending ? 'Uploading…' : 'Upload & Index'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
