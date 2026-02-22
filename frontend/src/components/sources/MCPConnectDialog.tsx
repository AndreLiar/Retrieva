'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { mcpApi } from '@/lib/api/mcp';
import type { MCPSourceType, TestConnectionResult } from '@/lib/api/mcp';

// ── Source type options ─────────────────────────────────────────────────────

const SOURCE_TYPES: { value: MCPSourceType; label: string }[] = [
  { value: 'confluence', label: 'Confluence' },
  { value: 'gdrive', label: 'Google Drive' },
  { value: 'github', label: 'GitHub' },
  { value: 'jira', label: 'Jira' },
  { value: 'slack', label: 'Slack' },
  { value: 'custom', label: 'Custom MCP server' },
];

// ── Component ──────────────────────────────────────────────────────────────

interface MCPConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function MCPConnectDialog({ open, onOpenChange, workspaceId }: MCPConnectDialogProps) {
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<MCPSourceType>('custom');
  const [serverUrl, setServerUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(24);

  // Test-connection state (independent from register mutation)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: () =>
      mcpApi.register({
        workspaceId,
        name: name.trim(),
        sourceType,
        serverUrl: serverUrl.trim().replace(/\/$/, ''),
        authToken: authToken.trim() || undefined,
        syncSettings: { autoSync, syncIntervalHours },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-sources', workspaceId] });
      handleClose();
    },
  });

  async function handleTestConnection() {
    if (!serverUrl.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await mcpApi.testConnection(
        serverUrl.trim().replace(/\/$/, ''),
        authToken.trim() || undefined,
        sourceType
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error)?.message ?? 'Connection failed' });
    } finally {
      setTestLoading(false);
    }
  }

  function handleClose() {
    if (registerMutation.isPending) return;
    setName('');
    setSourceType('custom');
    setServerUrl('');
    setAuthToken('');
    setAutoSync(false);
    setSyncIntervalHours(24);
    setTestResult(null);
    onOpenChange(false);
  }

  // Validate sync interval input
  function handleIntervalChange(v: string) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1 && n <= 168) setSyncIntervalHours(n);
  }

  const canSubmit =
    name.trim().length > 0 &&
    serverUrl.trim().length > 0 &&
    !registerMutation.isPending;

  const canTest = serverUrl.trim().length > 0 && !testLoading && !registerMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !registerMutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect MCP Server</DialogTitle>
          <DialogDescription>
            Register an external MCP server to index its documents into the knowledge base.
            The server must implement the{' '}
            <span className="font-mono text-xs">get_source_info</span>,{' '}
            <span className="font-mono text-xs">list_documents</span>, and{' '}
            <span className="font-mono text-xs">fetch_document</span> tools.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-name">Source name</Label>
            <Input
              id="mcp-name"
              placeholder="e.g. Engineering Confluence"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Source type */}
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-type">Source type</Label>
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v as MCPSourceType)}
              disabled={registerMutation.isPending}
            >
              <SelectTrigger id="mcp-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Server URL + test button */}
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-url">MCP server URL</Label>
            <div className="flex gap-2">
              <Input
                id="mcp-url"
                type="url"
                placeholder="https://mcp.yourcompany.com/confluence"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setTestResult(null);
                }}
                disabled={registerMutation.isPending}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canTest}
                onClick={handleTestConnection}
                className="shrink-0"
              >
                {testLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
              </Button>
            </div>

            {/* Test result inline */}
            {testResult && (
              <div
                className={`flex items-start gap-2 text-xs rounded-md px-3 py-2 ${
                  testResult.ok
                    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                <span>
                  {testResult.ok
                    ? `Connected — ${testResult.sourceInfo?.name ?? 'MCP server reachable'}${
                        testResult.sourceInfo?.totalDocuments != null
                          ? ` (${testResult.sourceInfo.totalDocuments} documents)`
                          : ''
                      }`
                    : (testResult.error ?? 'Connection failed')}
                </span>
              </div>
            )}
          </div>

          {/* Auth token */}
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-token">
              Auth token{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="mcp-token"
              type="password"
              placeholder="Bearer token for the MCP server"
              value={authToken}
              onChange={(e) => {
                setAuthToken(e.target.value);
                setTestResult(null);
              }}
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="mcp-autosync" className="cursor-pointer">
                Automatic sync
              </Label>
              <p className="text-xs text-muted-foreground">
                Re-index the source on a schedule
              </p>
            </div>
            <Switch
              id="mcp-autosync"
              checked={autoSync}
              onCheckedChange={setAutoSync}
              disabled={registerMutation.isPending}
            />
          </div>

          {/* Sync interval — only shown when auto-sync is on */}
          {autoSync && (
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-interval">Sync interval (hours)</Label>
              <Input
                id="mcp-interval"
                type="number"
                min={1}
                max={168}
                value={syncIntervalHours}
                onChange={(e) => handleIntervalChange(e.target.value)}
                disabled={registerMutation.isPending}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">Between 1 and 168 hours (1 week)</p>
            </div>
          )}

          {/* Register error */}
          {registerMutation.isError && (
            <p className="text-sm text-destructive">
              {(registerMutation.error as Error)?.message ?? 'Registration failed. Please try again.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={registerMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => registerMutation.mutate()} disabled={!canSubmit}>
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Registering…
              </>
            ) : (
              'Register & Sync'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
