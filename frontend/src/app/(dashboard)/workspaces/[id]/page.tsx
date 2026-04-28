import { WorkspaceOverviewPage } from '@/features/workspaces/components/workspace-overview-page';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

export default function WorkspacePage(props: WorkspacePageProps) {
  return <WorkspaceOverviewPage params={props.params} />;
}
