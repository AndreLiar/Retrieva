'use client';

/**
 * ClauseSignoffPanel — Step 4 gap fixes
 *
 * Adds to CONTRACT_A30 assessment reports:
 *  1. Per-clause Accept / Reject / Waive sign-off buttons
 *  2. Sign-off progress counter ("X of 12 reviewed")
 *  3. Negotiation round indicator ("Round N of M")
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { assessmentsApi } from '@/lib/api/assessments';
import type { Assessment, Gap, ClauseSignoff, ClauseSignoffStatus } from '@/lib/api/assessments';

// ── Art. 30 clauses constant (must match gapAnalysisAgent.js) ─────────────────

export const ART30_CLAUSES = [
  { ref: 'Art.30(2)(a)', category: 'Service Description',   text: 'Clear and complete description of all ICT services and functions to be provided' },
  { ref: 'Art.30(2)(b)', category: 'Data Governance',       text: 'Locations (countries/regions) where data will be processed and stored' },
  { ref: 'Art.30(2)(c)', category: 'Security & Resilience', text: 'Provisions on availability, authenticity, integrity and confidentiality of data' },
  { ref: 'Art.30(2)(d)', category: 'Data Governance',       text: 'Provisions for accessibility, return, recovery and secure deletion of data on exit' },
  { ref: 'Art.30(2)(e)', category: 'Subcontracting',        text: 'Full description of all subcontractors and their data processing locations' },
  { ref: 'Art.30(2)(f)', category: 'Business Continuity',   text: 'ICT service continuity conditions including service level objective amendments' },
  { ref: 'Art.30(2)(g)', category: 'Business Continuity',   text: "Business continuity plan provisions relevant to the financial entity's services" },
  { ref: 'Art.30(2)(h)', category: 'Termination & Exit',    text: 'Termination rights of the financial entity including adequate notice periods' },
  { ref: 'Art.30(3)(a)', category: 'Service Description',   text: 'Full service level descriptions with quantitative and qualitative performance targets' },
  { ref: 'Art.30(3)(b)', category: 'Regulatory Compliance', text: 'Advance notification obligations for material changes to ICT services' },
  { ref: 'Art.30(3)(c)', category: 'Audit & Inspection',    text: 'Right to carry out full audits and on-site inspections of the ICT provider' },
  { ref: 'Art.30(3)(d)', category: 'Security & Resilience', text: 'Obligation to assist the financial entity in ICT-related incident management' },
] as const;

// ── Sign-off config ────────────────────────────────────────────────────────────

const SIGNOFF_CONFIG: Record<ClauseSignoffStatus, { label: string; icon: React.ElementType; badgeClass: string; variant: 'default' | 'destructive' | 'outline' }> = {
  accepted: { label: 'Accepted',  icon: CheckCircle2,  badgeClass: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100', variant: 'default' },
  rejected: { label: 'Rejected',  icon: XCircle,       badgeClass: '', variant: 'destructive' },
  waived:   { label: 'Waived',    icon: MinusCircle,   badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100', variant: 'outline' },
};

// ── Negotiation round indicator ───────────────────────────────────────────────

export function NegotiationRoundBadge({
  assessments,
  currentId,
}: {
  assessments: Assessment[];
  currentId: string;
}) {
  const sorted = [...assessments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const roundN = sorted.findIndex((a) => a._id === currentId) + 1;
  const total  = sorted.length;
  if (total <= 1) return null;

  return (
    <Badge variant="outline" className="text-xs font-medium">
      Round {roundN} of {total}
    </Badge>
  );
}

// ── Clause sign-off row ────────────────────────────────────────────────────────

function ClauseSignoffRow({
  clause,
  gap,
  signoff,
  assessmentId,
}: {
  clause: typeof ART30_CLAUSES[number];
  gap: Gap | undefined;
  signoff: ClauseSignoff | undefined;
  assessmentId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote]         = useState('');

  const mutation = useMutation({
    mutationFn: (status: ClauseSignoffStatus) =>
      assessmentsApi.setClauseSignoff(assessmentId, clause.ref, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast.success(`Clause ${clause.ref} ${note ? 'noted and ' : ''}signed off`);
      setExpanded(false);
      setNote('');
    },
    onError: () => toast.error('Sign-off failed'),
  });

  const gapLevel = gap?.gapLevel ?? 'covered';
  const GapIcon =
    gapLevel === 'covered'  ? CheckCircle2
    : gapLevel === 'partial' ? AlertTriangle
    : XCircle;
  const gapIconClass =
    gapLevel === 'covered'  ? 'text-green-500'
    : gapLevel === 'partial' ? 'text-amber-500'
    : 'text-destructive';
  const rowClass =
    gapLevel === 'missing' ? 'bg-destructive/5'
    : gapLevel === 'partial' ? 'bg-amber-50/50 dark:bg-amber-950/10'
    : '';

  return (
    <div className={`px-4 py-3 ${rowClass}`}>
      <div className="flex items-start gap-3">
        <GapIcon className={`h-4 w-4 mt-0.5 shrink-0 ${gapIconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-muted-foreground">{clause.ref}</span>
            <Badge variant="outline" className="text-xs">{clause.category}</Badge>
            <Badge
              variant={gapLevel === 'covered' ? 'default' : gapLevel === 'partial' ? 'secondary' : 'destructive'}
              className="text-xs capitalize"
            >
              {gapLevel}
            </Badge>
            {signoff && (
              <Badge
                variant={SIGNOFF_CONFIG[signoff.status].variant}
                className={`text-xs ml-auto ${SIGNOFF_CONFIG[signoff.status].badgeClass}`}
              >
                {SIGNOFF_CONFIG[signoff.status].label}
              </Badge>
            )}
          </div>
          <p className="text-sm mt-1">{clause.text}</p>
          {gap?.recommendation && gapLevel !== 'covered' && (
            <p className={`text-xs mt-1 ${gapLevel === 'missing' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
              → {gap.recommendation}
            </p>
          )}
          {signoff && (
            <p className="text-xs text-muted-foreground mt-1">
              {SIGNOFF_CONFIG[signoff.status].label} by {signoff.signedByName || 'compliance officer'}{' '}
              · {format(new Date(signoff.signedAt), 'dd MMM yyyy')}{signoff.note ? ` — "${signoff.note}"` : ''}
            </p>
          )}
        </div>
        {/* Sign-off toggle */}
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Sign-off panel */}
      {expanded && (
        <div className="mt-3 ml-7 space-y-2">
          <Input
            placeholder="Optional note (e.g. 'Accepted pending SLA amendment')"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex gap-1.5 flex-wrap">
            {(['accepted', 'waived', 'rejected'] as const).map((s) => {
              const cfg = SIGNOFF_CONFIG[s];
              const Icon = cfg.icon;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={cfg.variant}
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(s)}
                  className="h-7 px-2.5 text-xs"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {cfg.label}
                </Button>
              );
            })}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export: Art30 Clause Scorecard with sign-off ─────────────────────────

export function Art30ClauseScorecardWithSignoff({
  assessment,
}: {
  assessment: Assessment;
}) {
  const gaps         = assessment.results?.gaps ?? [];
  const signoffs     = assessment.clauseSignoffs ?? [];
  const assessmentId = assessment._id;

  const results = ART30_CLAUSES.map((clause) => {
    const matchedGap = gaps.find((g) => g.article === clause.ref)
      ?? gaps.find((g) =>
          g.article?.startsWith(clause.ref.split('(')[0]) &&
          g.domain?.toLowerCase().includes(clause.category.split(' ')[0].toLowerCase())
        );
    const signoff = signoffs.find((s) => s.clauseRef === clause.ref);
    return { clause, gap: matchedGap, signoff };
  });

  const covered  = results.filter((r) => !r.gap || r.gap.gapLevel === 'covered').length;
  const partial  = results.filter((r) => r.gap?.gapLevel === 'partial').length;
  const missing  = results.filter((r) => r.gap?.gapLevel === 'missing').length;
  const reviewed = signoffs.length;

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 text-green-600 font-medium">
          <CheckCircle2 className="h-4 w-4" /> {covered} covered
        </span>
        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
          <AlertTriangle className="h-4 w-4" /> {partial} partial
        </span>
        <span className="flex items-center gap-1.5 text-destructive font-medium">
          <XCircle className="h-4 w-4" /> {missing} missing
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {reviewed} / {ART30_CLAUSES.length} signed off
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(reviewed / ART30_CLAUSES.length) * 100}%` }}
        />
      </div>

      {/* Clause rows */}
      <div className="rounded-md border divide-y overflow-hidden">
        {results.map(({ clause, gap, signoff }) => (
          <ClauseSignoffRow
            key={clause.ref}
            clause={clause}
            gap={gap}
            signoff={signoff}
            assessmentId={assessmentId}
          />
        ))}
      </div>
    </div>
  );
}
