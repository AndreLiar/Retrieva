'use client';

import { lazy, Suspense } from 'react';

const CreateWorkspaceWizard = lazy(() =>
  import('@/features/workspaces/components/create-workspace-wizard').then((m) => ({
    default: m.CreateWorkspaceWizard,
  })),
);

export function ModalOutlet() {
  return (
    <Suspense fallback={null}>
      <CreateWorkspaceWizard />
    </Suspense>
  );
}
