'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  FileText,
  Globe,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notionApi } from '@/lib/api';
import { sourcesApi } from '@/lib/api/sources';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { RequirePermission } from '@/components/common';
import { NotionWorkspaceCard, TokenHealthBanner } from '@/components/notion';
import { DataSourceCard } from '@/components/sources/DataSourceCard';
import { FileUploadDialog } from '@/components/sources/FileUploadDialog';
import { UrlAddDialog } from '@/components/sources/UrlAddDialog';
import { ConfluenceConnectDialog } from '@/components/sources/ConfluenceConnectDialog';

// ─── Notion source icon ───────────────────────────────────────────────────────
function NotionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function SyncStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'idle')
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> Idle
      </Badge>
    );
  if (status === 'syncing')
    return (
      <Badge className="gap-1 bg-blue-500 text-white hover:bg-blue-600">
        <Clock className="h-3 w-3 animate-spin" /> Syncing
      </Badge>
    );
  if (status === 'synced' || status === 'completed')
    return (
      <Badge className="gap-1 bg-green-500 text-white hover:bg-green-600">
        <CheckCircle2 className="h-3 w-3" /> Synced
      </Badge>
    );
  if (status === 'error' || status === 'failed')
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return <Badge variant="outline">{status}</Badge>;
}

// Suppress unused import warning — SyncStatusBadge uses these icons
void SyncStatusBadge;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SourcesPage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();

  // Dialog state
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [confluenceDialogOpen, setConfluenceDialogOpen] = useState(false);

  // Notion workspaces
  const { data: notionWorkspaces, isLoading: notionLoading } = useQuery({
    queryKey: ['notion-workspaces', activeWorkspace?.id],
    queryFn: async () => {
      const response = await notionApi.listWorkspaces();
      return response.data?.workspaces || [];
    },
    enabled: !!activeWorkspace?.id,
    refetchInterval: 10000,
  });

  // Generic data sources (file, url, confluence)
  const { data: dataSources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['data-sources', activeWorkspace?.id],
    queryFn: () => sourcesApi.list(activeWorkspace!.id),
    enabled: !!activeWorkspace?.id,
    refetchInterval: 10000,
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  const fileSources = (dataSources || []).filter((d) => d.sourceType === 'file');
  const urlSources = (dataSources || []).filter((d) => d.sourceType === 'url');
  const confluenceSources = (dataSources || []).filter((d) => d.sourceType === 'confluence');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Data Sources</h1>
        <p className="text-muted-foreground">
          Connect and manage the document sources that feed the DORA compliance knowledge base.
        </p>
      </div>

      {/* Token health (Notion-specific, owner only) */}
      <div className="mb-6">
        <TokenHealthBanner />
      </div>

      {/* ── Notion ─────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <NotionIcon className="h-5 w-5" />
            <h2 className="text-lg font-medium">Notion</h2>
            {notionWorkspaces && notionWorkspaces.length > 0 && (
              <Badge variant="secondary">{notionWorkspaces.length} connected</Badge>
            )}
          </div>
          <RequirePermission permission="canTriggerSync">
            <Button size="sm" onClick={() => router.push('/notion/connect')}>
              <Plus className="h-4 w-4 mr-1" /> Connect workspace
            </Button>
          </RequirePermission>
        </div>

        {notionLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : !notionWorkspaces || notionWorkspaces.length === 0 ? (
          <div className="text-center py-10 border rounded-lg bg-muted/30 border-dashed">
            <NotionIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No Notion workspaces connected</p>
            <p className="text-sm text-muted-foreground mb-4">
              Connect a Notion workspace to index your pages into the knowledge base.
            </p>
            <RequirePermission permission="canTriggerSync">
              <Button size="sm" onClick={() => router.push('/notion/connect')}>
                <Plus className="h-4 w-4 mr-1" /> Connect Notion
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {notionWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="cursor-pointer"
                onClick={() => router.push(`/notion/${workspace.id}`)}
              >
                <NotionWorkspaceCard workspace={workspace} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── File Upload ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">File Upload</h2>
            {fileSources.length > 0 && (
              <Badge variant="secondary">{fileSources.length}</Badge>
            )}
          </div>
          <RequirePermission permission="canTriggerSync">
            <Button size="sm" onClick={() => setFileDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Upload file
            </Button>
          </RequirePermission>
        </div>

        {sourcesLoading ? (
          <Skeleton className="h-24" />
        ) : fileSources.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30 border-dashed">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No files uploaded yet. Upload PDF, DOCX, or XLSX documents directly into the knowledge base.
            </p>
            <RequirePermission permission="canTriggerSync">
              <Button size="sm" variant="outline" onClick={() => setFileDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Upload file
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {fileSources.map((ds) => (
              <DataSourceCard key={ds._id} dataSource={ds} workspaceId={activeWorkspace.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── Web URL ─────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">Web URL</h2>
            {urlSources.length > 0 && (
              <Badge variant="secondary">{urlSources.length}</Badge>
            )}
          </div>
          <RequirePermission permission="canTriggerSync">
            <Button size="sm" onClick={() => setUrlDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add URL
            </Button>
          </RequirePermission>
        </div>

        {sourcesLoading ? (
          <Skeleton className="h-24" />
        ) : urlSources.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30 border-dashed">
            <Globe className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No URLs added yet. Crawl and index public web pages or regulatory document URLs.
            </p>
            <RequirePermission permission="canTriggerSync">
              <Button size="sm" variant="outline" onClick={() => setUrlDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add URL
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {urlSources.map((ds) => (
              <DataSourceCard key={ds._id} dataSource={ds} workspaceId={activeWorkspace.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── Confluence ──────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">Confluence</h2>
            {confluenceSources.length > 0 && (
              <Badge variant="secondary">{confluenceSources.length}</Badge>
            )}
          </div>
          <RequirePermission permission="canTriggerSync">
            <Button size="sm" onClick={() => setConfluenceDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Connect space
            </Button>
          </RequirePermission>
        </div>

        {sourcesLoading ? (
          <Skeleton className="h-24" />
        ) : confluenceSources.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30 border-dashed">
            <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No Confluence spaces connected yet. Connect Confluence Cloud spaces to index your internal wiki pages.
            </p>
            <RequirePermission permission="canTriggerSync">
              <Button size="sm" variant="outline" onClick={() => setConfluenceDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Connect space
              </Button>
            </RequirePermission>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {confluenceSources.map((ds) => (
              <DataSourceCard key={ds._id} dataSource={ds} workspaceId={activeWorkspace.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── Link to legacy Notion page ──────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1"
          onClick={() => router.push('/notion')}
        >
          <ExternalLink className="h-3 w-3" />
          Advanced Notion settings
        </Button>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <FileUploadDialog
        open={fileDialogOpen}
        onOpenChange={setFileDialogOpen}
        workspaceId={activeWorkspace.id}
      />
      <UrlAddDialog
        open={urlDialogOpen}
        onOpenChange={setUrlDialogOpen}
        workspaceId={activeWorkspace.id}
      />
      <ConfluenceConnectDialog
        open={confluenceDialogOpen}
        onOpenChange={setConfluenceDialogOpen}
        workspaceId={activeWorkspace.id}
      />
    </div>
  );
}
