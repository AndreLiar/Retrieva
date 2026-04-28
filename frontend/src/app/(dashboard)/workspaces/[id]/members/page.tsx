import { WorkspaceMembersPage } from '@/features/workspaces/components/workspace-members-page';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <WorkspaceMembersPage id={id} />;
}
