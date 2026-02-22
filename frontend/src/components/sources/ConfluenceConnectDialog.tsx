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

interface ConfluenceConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function ConfluenceConnectDialog({
  open,
  onOpenChange,
  workspaceId,
}: ConfluenceConnectDialogProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      sourcesApi.create({
        name: name.trim(),
        workspaceId,
        sourceType: 'confluence',
        config: {
          baseUrl: baseUrl.trim().replace(/\/$/, ''),
          spaceKey: spaceKey.trim(),
          email: email.trim(),
          apiToken: apiToken.trim(),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources', workspaceId] });
      handleClose();
    },
  });

  function handleClose() {
    setName('');
    setBaseUrl('');
    setSpaceKey('');
    setEmail('');
    setApiToken('');
    onOpenChange(false);
  }

  const canSubmit =
    name.trim().length > 0 &&
    baseUrl.trim().length > 0 &&
    spaceKey.trim().length > 0 &&
    email.trim().length > 0 &&
    apiToken.trim().length > 0 &&
    !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !mutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Confluence</DialogTitle>
          <DialogDescription>
            Index pages from a Confluence Cloud space using your API token.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cf-name">Source name</Label>
            <Input
              id="cf-name"
              placeholder="e.g. Engineering Wiki"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-base-url">Confluence base URL</Label>
            <Input
              id="cf-base-url"
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-space-key">Space key</Label>
            <Input
              id="cf-space-key"
              placeholder="ENG"
              value={spaceKey}
              onChange={(e) => setSpaceKey(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-email">Email</Label>
            <Input
              id="cf-email"
              type="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cf-token">API token</Label>
            <Input
              id="cf-token"
              type="password"
              placeholder="Atlassian API token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Generate a token at{' '}
              <span className="font-mono text-xs">
                id.atlassian.com/manage-profile/security/api-tokens
              </span>
            </p>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as Error)?.message ?? 'Connection failed. Please try again.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? 'Connecting…' : 'Connect & Sync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
