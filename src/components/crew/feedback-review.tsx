'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate } from '@/lib/utils';
import { feedbackNoteKindLabel, kindBadgeClass, type FeedbackNote } from '@/lib/crew-meetings-shared';

/** Per-note state while a meeting is being recorded. */
export type ReviewState = Record<string, { discussed: boolean; response: string }>;

/** Everything ticked by default — the usual case is going through the whole list. */
export function initialReviewState(notes: FeedbackNote[]): ReviewState {
  return Object.fromEntries(notes.map((n) => [n.id, { discussed: true, response: '' }]));
}

/** The payload completeMeeting takes. */
export function reviewPayload(state: ReviewState) {
  return Object.entries(state)
    .filter(([, v]) => v.discussed)
    .map(([noteId, v]) => ({ noteId, response: v.response }));
}

/**
 * The person's pending feedback, shown while their meeting is being recorded.
 * Ticked notes are marked discussed when the meeting is saved — and only then
 * become visible to them. Unticked ones wait for the next sit-down.
 */
export function FeedbackReviewList({
  notes,
  state,
  onChange,
}: {
  notes: FeedbackNote[];
  state: ReviewState;
  onChange: (next: ReviewState) => void;
}) {
  if (notes.length === 0) return null;

  function set(id: string, patch: Partial<ReviewState[string]>) {
    onChange({ ...state, [id]: { ...state[id], ...patch } });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">Feedback to go over ({notes.length})</p>
        <p className="text-xs text-muted-foreground">
          Ticked notes are marked discussed and become visible to them on their profile. Untick
          any you didn&apos;t get to — they&apos;ll wait for next time.
        </p>
      </div>
      <ul className="space-y-2">
        {notes.map((note) => {
          const s = state[note.id] ?? { discussed: true, response: '' };
          return (
            <li key={note.id} className="rounded-md border border-border bg-background p-2 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox
                  className="mt-0.5"
                  checked={s.discussed}
                  onCheckedChange={(v) => set(note.id, { discussed: v === true })}
                  aria-label="Discussed"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${kindBadgeClass(note.kind)}`}>
                      {feedbackNoteKindLabel(note.kind)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(note.created_at, 'MMM d')} · {note.author_name}
                      {note.job_label ? ` · ${note.job_label}` : ''}
                    </span>
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap">{note.body}</span>
                </span>
              </label>
              {s.discussed && (
                <input
                  className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  placeholder="What they said (optional)"
                  value={s.response}
                  onChange={(e) => set(note.id, { response: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
