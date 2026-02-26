'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  FileText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { sourcesApi } from '@/lib/api/sources';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { RequirePermission } from '@/components/common';
import { DataSourceCard } from '@/components/sources/DataSourceCard';
import { FileUploadDialog } from '@/components/sources/FileUploadDialog';

export default function SourcesPage() {
  const activeWorkspace = useActiveWorkspace();
  const [fileDialogOpen, setFileDialogOpen] = useState(false);

  const { data: dataSources, isLoading } = useQuery({
    queryKey: ['data-sources', activeWorkspace?.id],
    queryFn: () => sourcesApi.list(activeWorkspace!.id),
    enabled: !!activeWorkspace?.id,
    refetchInterval: 10000,
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a vendor first</p>
      </div>
    );
  }

  const fileSources = dataSources || [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Documents</h1>
        <p className="text-muted-foreground">
          Upload vendor documents (PDF, DOCX, XLSX) to analyze for DORA compliance gaps.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">Vendor Documents</h2>
            {fileSources.length > 0 && (
              <Badge variant="secondary">{fileSources.length}</Badge>
            )}
          </div>
          <RequirePermission permission="canTriggerSync">
            <Button size="sm" onClick={() => setFileDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Upload document
            </Button>
          </RequirePermission>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : fileSources.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/30 border-dashed">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No documents uploaded yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Upload your vendor&apos;s policy documents, contracts, and security reports
              to run a DORA compliance gap analysis.
            </p>
            <RequirePermission permission="canTriggerSync">
              <Button size="sm" onClick={() => setFileDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Upload document
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

      <FileUploadDialog
        open={fileDialogOpen}
        onOpenChange={setFileDialogOpen}
        workspaceId={activeWorkspace.id}
      />
    </div>
  );
}
