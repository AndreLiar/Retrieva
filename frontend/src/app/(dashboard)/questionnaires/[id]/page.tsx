import { QuestionnaireDetailPage } from '@/features/questionnaires/components/questionnaire-detail-page';

interface QuestionnairePageProps {
  params: Promise<{ id: string }>;
}

export default function Page(props: QuestionnairePageProps) {
  return <QuestionnaireDetailPage params={props.params} />;
}
