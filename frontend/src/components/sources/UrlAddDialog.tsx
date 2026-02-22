'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

interface UrlAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function UrlAddDialog({ open, onOpenChange, workspaceId }: UrlAddDialogProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      sourcesApi.create({
        name: name.trim(),
        workspaceId,
        sourceType: 'url',
        config: { url: url.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources', workspaceId] });
      handleClose();
    },
  });

  function handleClose() {
    setName('');
    setUrl('');
    setUrlError('');
    onOpenChange(false);
  }

  function handleUrlBlur() {
    if (url && !isValidUrl(url)) {
      setUrlError('Please enter a valid http or https URL.');
    } else {
      setUrlError('');
    }
  }

  const canSubmit =
    name.trim().length > 0 && url.trim().length > 0 && !urlError && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !mutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Web URL</DialogTitle>
          <DialogDescription>
            Crawl and index a public web page or regulatory document URL.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ds-url-name">Source name</Label>
            <Input
              id="ds-url-name"
              placeholder="e.g. EBA DORA Guidelines"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ds-url-input">URL</Label>
            <Input
              id="ds-url-input"
              type="url"
              placeholder="https://example.com/document"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              disabled={mutation.isPending}
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as Error)?.message ?? 'Failed to add URL. Please try again.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? 'Adding…' : 'Add & Index'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
