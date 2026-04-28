import { AssessmentDetailPage } from '@/features/assessments/components/assessment-detail-page';

interface AssessmentPageProps {
  params: Promise<{ id: string }>;
}

export default function Page(props: AssessmentPageProps) {
  return <AssessmentDetailPage params={props.params} />;
}
