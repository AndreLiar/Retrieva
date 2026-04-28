import { WorkspaceSettingsPage } from '@/features/workspaces/settings/workspace-settings-page';

interface WorkspaceSettingsRouteProps {
  params: Promise<{ id: string }>;
}

export default function Page(props: WorkspaceSettingsRouteProps) {
  return <WorkspaceSettingsPage params={props.params} />;
}
