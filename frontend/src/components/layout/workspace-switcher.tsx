'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, Building2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useWorkspaceStore,
  useActiveWorkspace,
} from '@/lib/stores/workspace-store';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';

export function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const activeWorkspace = useActiveWorkspace();
  const openModal = useUIStore((state) => state.openModal);
  const [open, setOpen] = useState(false);

  const handleSelectWorkspace = (workspaceId: string) => {
    setActiveWorkspace(workspaceId);
    setOpen(false);
  };

  const handleCreateWorkspace = () => {
    setOpen(false);
    openModal(MODAL_IDS.CREATE_WORKSPACE);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a workspace"
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {activeWorkspace?.name || 'Select workspace'}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]" side="right" align="start" sideOffset={8}>
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No workspaces found
          </div>
        ) : (
          workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => handleSelectWorkspace(workspace.id)}
              className="cursor-pointer"
            >
              <Building2 className="mr-2 h-4 w-4" />
              <span className="flex-1 truncate">{workspace.name}</span>
              {activeWorkspace?.id === workspace.id && (
                <Check className="ml-2 h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCreateWorkspace} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
