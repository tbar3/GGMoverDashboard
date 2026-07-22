'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
  tallyScores,
  type PillField,
  type ScoredQuestion,
} from '@/lib/interview-scorecard';

const textareaClass =
  'w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function Pills({
  field,
  value,
  onChange,
}: {
  field: PillField;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <div className="flex flex-wrap gap-2">
        {field.options.map((opt) => {
          const selected = value === opt.label;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(selected ? '' : opt.label)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? opt.warn
                    ? 'border-destructive bg-destructive text-white'
                    : 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoredQuestionCard({
  q,
  score,
  note,
  extra,
  onScore,
  onNote,
  onExtra,
}: {
  q: ScoredQuestion;
  score?: number;
  note?: string;
  extra?: string;
  onScore: (v: number) => void;
  onNote: (v: string) => void;
  onExtra: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <span
        className={cn(
          'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
          q.red ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-primary'
        )}
      >
        {q.tag}
      </span>

      <p className="text-sm font-medium leading-relaxed">{q.question}</p>

      {q.listenFor && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Listen for: </span>
          {q.listenFor}
        </p>
      )}
      {q.redFlags && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-destructive">Red flags: </span>
          {q.redFlags}
        </p>
      )}

      {q.extraField && (
        <div className="space-y-2">
          <Label>{q.extraField.label}</Label>
          <Input
            value={extra ?? ''}
            placeholder={q.extraField.placeholder}
            onChange={(e) => onExtra(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Score
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onScore(score === n ? 0 : n)}
            className={cn(
              'h-9 w-9 rounded-md border text-sm font-semibold transition-colors',
              score === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-muted'
            )}
            aria-label={`Score ${n}`}
          >
            {n}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">{q.anchor}</span>
      </div>

      <textarea
        className={textareaClass}
        placeholder="Notes"
        value={note ?? ''}
        onChange={(e) => onNote(e.target.value)}
      />
    </div>
  );
}

export function ScorecardForm({ interviewerName }: { interviewerName: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidate + interview meta
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState<string>(POSITIONS[0].value);
  const [referredBy, setReferredBy] = useState('');
  const [interviewer, setInterviewer] = useState(interviewerName);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Everything else lives in these maps and is persisted as `responses` JSONB.
  const [pills, setPills] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [policies, setPolicies] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<string>('');
  const [finalNotes, setFinalNotes] = useState('');

  // Same tally the server recomputes on save — this is only the live preview.
  const tally = useMemo(() => tallyScores(scores), [scores]);

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError('Candidate name is required.');
      return;
    }

    setSaving(true);
    try {
      const candidateRes = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone || null,
          position,
          referred_by: referredBy || null,
          status: recommendation || 'interviewed',
        }),
      });
      if (!candidateRes.ok) {
        throw new Error((await candidateRes.json()).error ?? 'Could not save candidate');
      }
      const candidate = await candidateRes.json();

      const scorecardRes = await fetch('/api/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidate.id,
          interviewer_name: interviewer,
          interview_date: date,
          recommendation: recommendation || null,
          final_notes: finalNotes || null,
          responses: { pills, texts, policies, scores, notes },
        }),
      });
      if (!scorecardRes.ok) {
        throw new Error((await scorecardRes.json()).error ?? 'Could not save scorecard');
      }
      const scorecard = await scorecardRes.json();

      router.push(`/admin/hiring/${scorecard.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong saving this scorecard.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Candidate */}
      <Card>
        <CardHeader>
          <CardTitle>Candidate</CardTitle>
          <CardDescription>Serve &amp; Elevate Others · People Before Profit</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cname">Candidate Name</Label>
            <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cdate">Date</Label>
            <Input id="cdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpos">Position</Label>
            <select
              id="cpos"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cint">Interviewer</Label>
            <Input id="cint" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cphone">Phone</Label>
            <Input id="cphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(___) ___-____" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cref">Referred By</Label>
            <Input id="cref" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Crew member / Indeed / etc." />
          </div>
        </CardContent>
      </Card>

      {/* 1 · Moving Experience */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Moving Experience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOVING_TEXT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input
                  value={texts[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOVING_PILLS.map((f) => (
              <Pills
                key={f.key}
                field={f}
                value={pills[f.key]}
                onChange={(v) => setPills({ ...pills, [f.key]: v })}
              />
            ))}
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea
              className={textareaClass}
              placeholder="Physical condition, heaviest items handled, stairs experience..."
              value={notes.moving ?? ''}
              onChange={(e) => setNotes({ ...notes, moving: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2 · Driving */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Driving Experience &amp; Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DRIVING_TEXT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input
                  value={texts[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DRIVING_PILLS.map((f) => (
              <Pills
                key={f.key}
                field={f}
                value={pills[f.key]}
                onChange={(v) => setPills({ ...pills, [f.key]: v })}
              />
            ))}
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea
              className={textareaClass}
              placeholder="Backing skills, towing, city vs highway comfort..."
              value={notes.driving ?? ''}
              onChange={(e) => setNotes({ ...notes, driving: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3 · Policy Walkthrough */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Policy Walkthrough</CardTitle>
          <CardDescription>
            Go over each one out loud. Check the box once it&apos;s covered and the candidate
            confirms they&apos;re on board. Watch for hesitation — that&apos;s data too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {POLICY_WALKTHROUGH.map((p) => (
            <label
              key={p.key}
              className="flex gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={policies[p.key] ?? false}
                onChange={(e) => setPolicies({ ...policies, [p.key]: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-xs text-muted-foreground">{p.detail}</span>
              </span>
            </label>
          ))}
          <div className="space-y-2 pt-2">
            <Label>Candidate reaction / concerns</Label>
            <textarea
              className={textareaClass}
              placeholder="Any pushback, questions, or red flags during the policy review?"
              value={notes.policy_reaction ?? ''}
              onChange={(e) => setNotes({ ...notes, policy_reaction: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* 4 · Core Values */}
      <Card>
        <CardHeader>
          <CardTitle>4 · Core Values</CardTitle>
          <CardDescription>
            Score each 1–5. A &quot;3&quot; is a believable, specific answer. A &quot;5&quot; has
            detail you couldn&apos;t make up. A &quot;1&quot; is vague, generic, or coached.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CORE_VALUE_QUESTIONS.map((q) => (
            <ScoredQuestionCard
              key={q.key}
              q={q}
              score={scores[q.key]}
              note={notes[q.key]}
              extra={texts[q.key]}
              onScore={(v) => setScores({ ...scores, [q.key]: v })}
              onNote={(v) => setNotes({ ...notes, [q.key]: v })}
              onExtra={(v) => setTexts({ ...texts, [q.key]: v })}
            />
          ))}
        </CardContent>
      </Card>

      {/* 5 · Theoreticals */}
      <Card>
        <CardHeader>
          <CardTitle>5 · The Theoreticals</CardTitle>
          <CardDescription>
            Read each scenario out loud, word for word. Then stay quiet and let them think — the
            silence is part of the test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {THEORETICAL_QUESTIONS.map((q) => (
            <ScoredQuestionCard
              key={q.key}
              q={q}
              score={scores[q.key]}
              note={notes[q.key]}
              extra={texts[q.key]}
              onScore={(v) => setScores({ ...scores, [q.key]: v })}
              onNote={(v) => setNotes({ ...notes, [q.key]: v })}
              onExtra={(v) => setTexts({ ...texts, [q.key]: v })}
            />
          ))}
        </CardContent>
      </Card>

      {/* 6 · Decision */}
      <Card>
        <CardHeader>
          <CardTitle>6 · Decision</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-muted/40 p-6 text-center">
            <div className="text-5xl font-bold">{tally.total}</div>
            <div className="text-sm text-muted-foreground mt-1">
              out of {MAX_SCORE} · {tally.scoredCount}/{ALL_SCORED_QUESTIONS.length} questions
              scored
            </div>
            <div className="mt-3 text-lg font-semibold">
              {tally.band ? FIT_BAND_LABELS[tally.band] : '—'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recommendation</Label>
              <div className="flex flex-wrap gap-2">
                {RECOMMENDATIONS.map((r) => {
                  const selected = recommendation === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRecommendation(selected ? '' : r.value)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition-colors',
                        selected
                          ? 'warn' in r && r.warn
                            ? 'border-destructive bg-destructive text-white'
                            : 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-muted'
                      )}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gut Check &amp; Final Notes</Label>
              <textarea
                className={cn(textareaClass, 'min-h-[90px]')}
                placeholder="Would you want this person in a customer's home tomorrow? Would the crew respect him?"
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pb-10">
        <Button variant="outline" onClick={() => router.push('/admin/hiring')} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Scorecard'}
        </Button>
      </div>
    </div>
  );
}
