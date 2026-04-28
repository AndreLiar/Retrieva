import { ConversationPage } from '@/features/chat/components/conversation-page';

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export default function Page(props: ConversationPageProps) {
  return <ConversationPage params={props.params} />;
}
