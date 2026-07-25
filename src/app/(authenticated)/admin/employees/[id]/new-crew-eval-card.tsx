'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EVAL_CATEGORIES, type NewCrewEvaluation } from '@/lib/new-crew-eval-shared';
import { submitNewCrewEval } from '@/lib/new-crew-eval-actions';
import { format } from 'date-fns';

const OUTCOMES = [
  { value: 'pass', label: 'Pass — keep on', tone: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'extend', label: 'Extend probation', tone: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'terminate', label: 'Do not keep', tone: 'bg-red-100 text-red-800 border-red-300' },
] as const;

function outcomeBadge(outcome: string | null) {
  const o = OUTCOMES.find((x) => x.value === outcome);
  if (!o) return null;
  return <Badge className={`${o.tone} border`}>{o.label}</Badge>;
}

export function NewCrewEvalCard({
  employeeId,
  dueDate,
  existing,
}: {
  employeeId: string;
  dueDate: string | null;
  existing: NewCrewEvaluation | null;
}) {
  const router = useRouter();
  const done = !!existing?.completed_at;
  const [editing, setEditing] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!outcome) {
      toast.error('Pick an outcome');
      return;
    }
    setSaving(true);
    const res = await submitNewCrewEval({ employeeId, outcome, ratings, notes });
    setSaving(false);
    if (res.ok) {
      toast.success('Evaluation saved');
      setEditing(false);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Could not save');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          30-Day New Crew Evaluation
          {done && outcomeBadge(existing!.outcome)}
        </CardTitle>
        <CardDescription>
          {done
            ? `Completed ${format(new Date(existing!.completed_at!), 'MMM d, yyyy')}${
                existing!.completed_by_name ? ` by ${existing!.completed_by_name}` : ''
              }`
            : dueDate
              ? `Due ${format(new Date(`${dueDate}T12:00:00`), 'MMM d, yyyy')} (30 days after start)`
              : 'Probation review for new crew members.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {done && !editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EVAL_CATEGORIES.map((c) => {
                const v = existing![c.key as keyof NewCrewEvaluation] as number | null;
                return (
                  <div key={c.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{c.label}</span>
                    <span className="font-semibold">{v ?? '—'}{v ? '/5' : ''}</span>
                  </div>
                );
              })}
            </div>
            {existing!.notes && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{existing!.notes}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Re-evaluate
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {EVAL_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{c.label}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRatings((r) => ({ ...r, [c.key]: n }))}
                        className={`h-8 w-8 rounded-md border text-sm font-medium transition-colors ${
                          ratings[c.key] === n
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Outcome</p>
              <div className="flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOutcome(o.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      outcome === o.value ? o.tone : 'hover:bg-muted'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Strengths, concerns, next steps…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save evaluation'}
              </Button>
              {done && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
