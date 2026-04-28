'use client';

import { use } from 'react';
import { Loader2 } from 'lucide-react';

import { WorkspaceSettingsForm } from '@/features/workspaces/settings/workspace-settings-form';
import { useWorkspaceSettings } from '@/features/workspaces/settings/use-workspace-settings';

interface WorkspaceSettingsPageProps {
  params: Promise<{ id: string }>;
}

export function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { id } = use(params);
  const settings = useWorkspaceSettings(id);

  if (!settings.workspace || !settings.isWorkspaceOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <WorkspaceSettingsForm
      workspace={settings.workspace}
      workspaceId={id}
      form={settings.form}
      vendorFunctions={settings.vendorFunctions}
      certificationsFieldArray={settings.certificationsFieldArray}
      updateMutation={settings.updateMutation}
      deleteMutation={settings.deleteMutation}
      latestQuestionnaire={settings.latestQuestionnaire}
      isQuestionnaireLoading={settings.isQuestionnaireLoading}
    />
  );
}
