'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { questionnairesApi } from '@/lib/api/questionnaires';
import type { QuestionnaireQuestion } from '@/lib/api/questionnaires';

// The 8 DORA categories in display order
const CATEGORY_ORDER = [
  'ICT Governance',
  'Security Controls',
  'Incident Management',
  'Business Continuity',
  'Audit Rights',
  'Subcontracting',
  'Data Governance',
  'Exit Planning',
  'Regulatory History',
];

type PageState =
  | { type: 'loading' }
  | { type: 'expired' }
  | { type: 'already_complete' }
  | { type: 'error'; message: string }
  | {
      type: 'form';
      vendorName: string;
      questions: QuestionnaireQuestion[];
    }
  | { type: 'submitted' };

export default function VendorQuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [currentCategoryIdx, setCurrentCategoryIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Load form on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await questionnairesApi.getPublicForm(token);

        if (res.data?.alreadyComplete) {
          setPageState({ type: 'already_complete' });
          return;
        }

        const questions = res.data?.questions ?? [];
        const vendorName = res.data?.vendorName ?? '';

        // Pre-populate with any existing partial answers
        const map = new Map<string, string>();
        questions.forEach((q) => {
          if (q.answer) map.set(q.id, q.answer);
        });
        setAnswers(map);
        setPageState({ type: 'form', vendorName, questions });
      } catch (err: unknown) {
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 410) {
          setPageState({ type: 'expired' });
        } else if (status === 404) {
          setPageState({ type: 'error', message: 'Questionnaire not found.' });
        } else {
          setPageState({ type: 'error', message: 'Unable to load questionnaire. Please try again.' });
        }
      }
    };
    load();
  }, [token]);

  const getQuestionsForCategory = useCallback(
    (questions: QuestionnaireQuestion[], category: string) =>
      questions.filter((q) => q.category === category),
    []
  );

  const getCategories = useCallback((questions: QuestionnaireQuestion[]) => {
    const presentCategories = new Set(questions.map((q) => q.category));
    return CATEGORY_ORDER.filter((cat) => presentCategories.has(cat));
  }, []);

  const saveProgress = useCallback(
    async (questions: QuestionnaireQuestion[], isFinal: boolean) => {
      setIsSaving(true);
      try {
        const answersPayload = questions.map((q) => ({
          id: q.id,
          answer: answers.get(q.id) || '',
        }));

        await questionnairesApi.submitResponse(token, {
          answers: answersPayload,
          final: isFinal,
        });

        if (isFinal) {
          setPageState({ type: 'submitted' });
        }
      } catch {
        toast.error('Failed to save progress. Please try again.');
      } finally {
        setIsSaving(false);
      }
    },
    [token, answers]
  );

  const handleNext = async (questions: QuestionnaireQuestion[], categories: string[]) => {
    // Save partial progress on each step transition
    await saveProgress(questions, false);
    if (currentCategoryIdx < categories.length - 1) {
      setCurrentCategoryIdx((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (questions: QuestionnaireQuestion[]) => {
    await saveProgress(questions, true);
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (pageState.type === 'loading') {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading questionnaire…</p>
        </div>
      </PublicLayout>
    );
  }

  if (pageState.type === 'expired') {
    return (
      <PublicLayout>
        <Card className="border-amber-200">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Link Expired</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              This questionnaire link has expired. Please contact your assessment team to request a
              new link.
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (pageState.type === 'already_complete') {
    return (
      <PublicLayout>
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Response Already Received</h2>
            <p className="text-muted-foreground text-sm">
              Thank you — your response has already been received and is being processed.
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (pageState.type === 'submitted') {
    return (
      <PublicLayout>
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-3">Thank you!</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your DORA due diligence questionnaire has been submitted successfully. The results will
              be reviewed by the requesting organisation&apos;s compliance team.
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (pageState.type === 'error') {
    return (
      <PublicLayout>
        <Card className="border-destructive/50">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm">{pageState.message}</p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  const { vendorName, questions } = pageState;
  const categories = getCategories(questions);
  const currentCategory = categories[currentCategoryIdx];
  const categoryQuestions = getQuestionsForCategory(questions, currentCategory);
  const totalSteps = categories.length;
  const progress = ((currentCategoryIdx + 1) / totalSteps) * 100;
  const isLastStep = currentCategoryIdx === totalSteps - 1;

  return (
    <PublicLayout>
      <div className="space-y-5">
        {/* Vendor greeting */}
        <div>
          <h2 className="text-lg font-semibold">DORA Art.28/30 Due Diligence</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Completing questionnaire for <strong>{vendorName}</strong>
          </p>
        </div>

        {/* Step indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Step {currentCategoryIdx + 1} of {totalSteps} — {currentCategory}
            </span>
            <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Questions for current category */}
        <div className="space-y-6">
          {categoryQuestions.map((q) => (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">
                    {q.doraArticle}
                  </Badge>
                  <CardTitle className="text-sm font-medium leading-snug">{q.text}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {q.hint && (
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-md px-3 py-2">
                    {q.hint}
                  </p>
                )}
                <Textarea
                  placeholder="Please provide a detailed response…"
                  rows={4}
                  value={answers.get(q.id) || ''}
                  onChange={(e) => {
                    const next = new Map(answers);
                    next.set(q.id, e.target.value);
                    setAnswers(next);
                  }}
                  className="resize-y text-sm"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {(answers.get(q.id) || '').length} characters
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => {
              setCurrentCategoryIdx((i) => Math.max(0, i - 1));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            disabled={currentCategoryIdx === 0 || isSaving}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {isLastStep ? (
            <Button
              onClick={() => handleSubmit(questions)}
              disabled={isSaving}
              className="min-w-[160px]"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {isSaving ? 'Submitting…' : 'Submit Questionnaire'}
            </Button>
          ) : (
            <Button
              onClick={() => handleNext(questions, categories)}
              disabled={isSaving}
              className="min-w-[160px]"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <>
                  Save &amp; Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Your progress is saved automatically as you move between steps.
        </p>
      </div>
    </PublicLayout>
  );
}

// ---------------------------------------------------------------------------
// Minimal public layout (no dashboard sidebar)
// ---------------------------------------------------------------------------

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <div className="border-b bg-card/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-bold text-base">Retrieva</span>
          <span className="text-xs text-muted-foreground">· Third-Party Risk</span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">{children}</div>
    </div>
  );
}
