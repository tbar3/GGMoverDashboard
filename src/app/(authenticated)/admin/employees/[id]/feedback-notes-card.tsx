'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquareText, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  FEEDBACK_NOTE_KINDS,
  feedbackNoteKindLabel,
  kindBadgeClass,
  type FeedbackJobOption,
  type FeedbackNote,
  type FeedbackNoteKind,
} from '@/lib/crew-meetings-shared';
import {
  addFeedbackNote,
  updateFeedbackNote,
  deleteFeedbackNote,
} from '@/lib/crew-meetings-actions';

const textareaClass =
  'w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/**
 * Individual feedback for one person, on their employee page.
 *
 * Notes pile up here between sit-downs and are gone over when the next meeting
 * is recorded (the Meetings card below). Until then they are the office's alone;
 * once discussed they lock and appear on the person's own profile.
 */
export function FeedbackNotesCard({
  employeeId,
  employeeName,
  notes,
  jobs,
}: {
  employeeId: string;
  employeeName: string;
  notes: FeedbackNote[];
  jobs: FeedbackJobOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<FeedbackNoteKind>('praise');
  const [body, setBody] = useState('');
  const [jobId, setJobId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDiscussed, setShowDiscussed] = useState(false);

  const waiting = notes.filter((n) => !n.discussed_at);
  const discussed = notes.filter((n) => n.discussed_at);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      toast.success(ok);
      after?.();
      router.refresh();
    });
  }

  function add() {
    if (!body.trim()) return;
    run(
      () => addFeedbackNote({ employeeId, kind, body, jobId: jobId || undefined }),
      'Feedback logged',
      () => {
        setBody('');
        setJobId('');
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Feedback notes
        </CardTitle>
        <CardDescription>
          Log feedback as it happens and go over it at the next sit-down. {employeeName} can&apos;t
          see a note until it&apos;s been discussed in a recorded meeting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <div role="radiogroup" aria-label="Kind of feedback" className="inline-flex rounded-md border border-input p-0.5">
            {FEEDBACK_NOTE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${
                  kind === k.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            className={textareaClass}
            placeholder={
              kind === 'praise'
                ? 'e.g. Customer called to say he was great with their kids during the move.'
                : kind === 'needs_work'
                  ? 'e.g. Left the dolly at the customer’s house — second time this month.'
                  : 'e.g. Ready to start learning to drive the 26-footer.'
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${selectClass} sm:w-[300px]`}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              aria-label="Related job"
            >
              <option value="">No job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            <Button onClick={add} disabled={pending || !body.trim()}>
              Log feedback
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            Waiting to go over ({waiting.length})
          </p>
          {waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((note) =>
                editingId === note.id ? (
                  <li key={note.id}>
                    <EditNote
                      note={note}
                      pending={pending}
                      onCancel={() => setEditingId(null)}
                      onSave={(k, b) =>
                        run(() => updateFeedbackNote({ id: note.id, kind: k, body: b }), 'Saved', () =>
                          setEditingId(null)
                        )
                      }
                    />
                  </li>
                ) : (
                  <li key={note.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${kindBadgeClass(note.kind)}`}>
                        {feedbackNoteKindLabel(note.kind)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(note.created_at, 'MMM d')} · {note.author_name}
                        {note.job_label ? ` · ${note.job_label}` : ''}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Edit this note"
                        onClick={() => setEditingId(note.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete this note"
                        disabled={pending}
                        onClick={() => run(() => deleteFeedbackNote(note.id), 'Note deleted')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                  </li>
                )
              )}
            </ul>
          )}
          {waiting.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Book or record a meeting in the Meetings card to go over these.
            </p>
          )}
        </div>

        {discussed.length > 0 && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowDiscussed((v) => !v)}
            >
              <Eye className="h-4 w-4" />
              {showDiscussed ? 'Hide' : 'Show'} discussed ({discussed.length})
            </button>
            {showDiscussed && (
              <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                {discussed.map((note) => (
                  <li key={note.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${kindBadgeClass(note.kind)}`}>
                        {feedbackNoteKindLabel(note.kind)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Discussed {formatDate(note.discussed_at, 'MMM d, yyyy')} · logged by{' '}
                        {note.author_name}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap">{note.body}</p>
                    {note.crew_response && (
                      <p className="mt-0.5 text-muted-foreground">
                        They said: &ldquo;{note.crew_response}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditNote({
  note,
  pending,
  onCancel,
  onSave,
}: {
  note: FeedbackNote;
  pending: boolean;
  onCancel: () => void;
  onSave: (kind: FeedbackNoteKind, body: string) => void;
}) {
  const [kind, setKind] = useState<FeedbackNoteKind>(note.kind);
  const [body, setBody] = useState(note.body);
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <select
        className={`${selectClass} sm:w-[180px]`}
        value={kind}
        onChange={(e) => setKind(e.target.value as FeedbackNoteKind)}
        aria-label="Kind of feedback"
      >
        {FEEDBACK_NOTE_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <textarea className={textareaClass} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !body.trim()} onClick={() => onSave(kind, body)}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
