import { queryOne } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  POSITIONS,
  RECOMMENDATIONS,
  MOVING_PILLS,
  MOVING_TEXT_FIELDS,
  DRIVING_PILLS,
  DRIVING_TEXT_FIELDS,
  POLICY_WALKTHROUGH,
  CORE_VALUE_QUESTIONS,
  THEORETICAL_QUESTIONS,
  ALL_SCORED_QUESTIONS,
  MAX_SCORE,
  FIT_BAND_LABELS,
  type FitBand,
} from '@/lib/interview-scorecard';

interface ScorecardRow {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_position: string;
  candidate_phone: string | null;
  candidate_referred_by: string | null;
  interviewer_name: string;
  interview_date: string;
  total_score: number;
  scored_count: number;
  fit_band: FitBand | null;
  recommendation: string | null;
  final_notes: string | null;
  responses: {
    pills?: Record<string, string>;
    texts?: Record<string, string>;
    policies?: Record<string, boolean>;
    scores?: Record<string, number>;
    notes?: Record<string, string>;
  };
}

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const s = await queryOne<ScorecardRow>(
    `SELECT s.*, c.name AS candidate_name, c.position AS candidate_position,
            c.phone AS candidate_phone, c.referred_by AS candidate_referred_by
     FROM interview_scorecards s
     JOIN candidates c ON c.id = s.candidate_id
     WHERE s.id = $1`,
    [id]
  );

  if (!s) notFound();

  const r = s.responses ?? {};
  const pills = r.pills ?? {};
  const texts = r.texts ?? {};
  const policies = r.policies ?? {};
  const scores = r.scores ?? {};
  const notes = r.notes ?? {};

  const positionLabel =
    POSITIONS.find((p) => p.value === s.candidate_position)?.label ?? s.candidate_position;
  const recommendationLabel =
    RECOMMENDATIONS.find((x) => x.value === s.recommendation)?.label ?? '—';

  return (
    <div className="p-6 space-y-6 print:p-0">
      <div className="print:hidden">
        <Link href="/admin/hiring" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to Hiring
        </Link>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{s.candidate_name}</h1>
          <p className="text-muted-foreground mt-1">
            {positionLabel} · interviewed {format(new Date(s.interview_date), 'MMMM d, yyyy')} by{' '}
            {s.interviewer_name}
          </p>
        </div>
      </div>

      {/* Result */}
      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          <div className="text-center">
            <div className="text-5xl font-bold">{s.total_score}</div>
            <div className="text-sm text-muted-foreground mt-1">
              out of {MAX_SCORE} · {s.scored_count}/{ALL_SCORED_QUESTIONS.length} scored
            </div>
          </div>
          <div className="text-center self-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Fit</div>
            <div className="text-lg font-semibold mt-1">
              {s.fit_band ? FIT_BAND_LABELS[s.fit_band] : '—'}
            </div>
          </div>
          <div className="text-center self-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Recommendation
            </div>
            <div className="text-lg font-semibold mt-1">{recommendationLabel}</div>
          </div>
        </CardContent>
      </Card>

      {/* Candidate details */}
      <Card>
        <CardHeader>
          <CardTitle>Candidate</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground block text-xs">Phone</span>
            {s.candidate_phone || '—'}
          </div>
          <div>
            <span className="text-muted-foreground block text-xs">Referred By</span>
            {s.candidate_referred_by || '—'}
          </div>
          <div>
            <span className="text-muted-foreground block text-xs">Position</span>
            {positionLabel}
          </div>
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Moving Experience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOVING_TEXT_FIELDS.map((f) => (
              <div key={f.key}>
                <span className="text-muted-foreground block text-xs">{f.label}</span>
                {texts[f.key] || '—'}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOVING_PILLS.map((f) => (
              <div key={f.key}>
                <span className="text-muted-foreground block text-xs">{f.label}</span>
                {pills[f.key] || '—'}
              </div>
            ))}
          </div>
          {notes.moving && (
            <div>
              <span className="text-muted-foreground block text-xs">Notes</span>
              <p className="whitespace-pre-wrap">{notes.moving}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2 · Driving Experience &amp; Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DRIVING_TEXT_FIELDS.map((f) => (
              <div key={f.key}>
                <span className="text-muted-foreground block text-xs">{f.label}</span>
                {texts[f.key] || '—'}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DRIVING_PILLS.map((f) => (
              <div key={f.key}>
                <span className="text-muted-foreground block text-xs">{f.label}</span>
                {pills[f.key] || '—'}
              </div>
            ))}
          </div>
          {notes.driving && (
            <div>
              <span className="text-muted-foreground block text-xs">Notes</span>
              <p className="whitespace-pre-wrap">{notes.driving}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policies */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Policy Walkthrough</CardTitle>
          <CardDescription>
            {Object.values(policies).filter(Boolean).length} of {POLICY_WALKTHROUGH.length} covered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {POLICY_WALKTHROUGH.map((p) => (
            <div key={p.key} className="flex items-start gap-2">
              <span className={policies[p.key] ? 'text-green-600' : 'text-muted-foreground'}>
                {policies[p.key] ? '✓' : '○'}
              </span>
              <span className={policies[p.key] ? '' : 'text-muted-foreground'}>{p.title}</span>
            </div>
          ))}
          {notes.policy_reaction && (
            <div className="pt-2">
              <span className="text-muted-foreground block text-xs">
                Candidate reaction / concerns
              </span>
              <p className="whitespace-pre-wrap">{notes.policy_reaction}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scored sections */}
      {[
        { title: '4 · Core Values', questions: CORE_VALUE_QUESTIONS },
        { title: '5 · The Theoreticals', questions: THEORETICAL_QUESTIONS },
      ].map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.questions.map((q) => (
              <div key={q.key} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">{q.tag}</Badge>
                  <span className="text-sm font-semibold">
                    {scores[q.key] ? `${scores[q.key]}/5` : 'not scored'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{q.question}</p>
                {q.extraField && texts[q.key] && (
                  <div className="text-sm">
                    <span className="text-muted-foreground block text-xs">
                      {q.extraField.label}
                    </span>
                    {texts[q.key]}
                  </div>
                )}
                {notes[q.key] && <p className="text-sm whitespace-pre-wrap">{notes[q.key]}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {s.final_notes && (
        <Card>
          <CardHeader>
            <CardTitle>Gut Check &amp; Final Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{s.final_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
