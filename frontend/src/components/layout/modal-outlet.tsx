'use client';

import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import { workspacesApi } from '@/lib/api/workspaces';

function CreateWorkspaceModal() {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const isOpen = activeModal === MODAL_IDS.CREATE_WORKSPACE;

  const mutation = useMutation({
    mutationFn: () => workspacesApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Vendor workspace created');
      setName('');
      closeModal();
    },
    onError: () => toast.error('Failed to create workspace'),
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
      setName('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Vendor Workspace</DialogTitle>
          <DialogDescription>
            Create a workspace for a vendor. Upload their documents to run a DORA compliance gap analysis.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Vendor name</Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Acme Software GmbH"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) mutation.mutate(); }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4 mr-2" />
            )}
            Create workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModalOutlet() {
  return (
    <>
      <CreateWorkspaceModal />
    </>
  );
}
