'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Star,
  ShieldCheck,
  MessageSquarePlus,
  BookOpen,
  Check,
  X,
  PinOff,
  Trash2,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatDate } from '@/lib/utils';
import {
  type RecognitionGroup,
  type RecognitionItem,
  type MeetingNote,
  type PolicyOfDay,
} from '@/lib/morning-meeting-shared';
import { policyCategoryLabel, type Policy } from '@/lib/policies-shared';
import {
  dismissRecognition,
  restoreRecognition,
  addNote,
  deleteNote,
  promoteNote,
  pinPolicyOfDay,
  unpinPolicyOfDay,
} from '@/lib/morning-meeting-actions';

const textareaClass =
  'w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

/** Positives wear the icon of what earned them, so a board reads at a glance. */
function iconFor(item: RecognitionItem) {
  if (item.type === 'FIVE_STAR_REVIEW') return <Star className="h-3.5 w-3.5" />;
  if (item.type === 'COMPLIANCE_PLUS') return <ShieldCheck className="h-3.5 w-3.5" />;
  return <Sparkles className="h-3.5 w-3.5" />;
}

export default function MorningMeetingBoard({
  today,
  board,
  policies,
  notes,
  policyOfDay,
  history,
}: {
  today: string;
  board: RecognitionGroup[];
  policies: Policy[];
  notes: MeetingNote[];
  policyOfDay: PolicyOfDay;
  history: { meeting_date: string; title: string | null; pinned: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const totalWins = board.reduce((n, g) => n + g.items.length, 0);
  const freshWins = board.reduce((n, g) => n + g.fresh_count, 0);
  const todaysNotes = notes.filter((n) => n.meeting_date === today);
  const earlierNotes = notes.filter((n) => n.meeting_date !== today);


  /**
   * Every write goes through here: run it, toast the outcome, refresh the server
   * data. A dismissal comes back with the ids it touched, which becomes a real
   * Undo on the toast — the one action in this module that is easy to fire by
   * reflex and annoying to reverse by hand.
   */
  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMessage: string,
    onSuccess?: () => void
  ) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      onSuccess?.();
      const ids = (result as { ids?: string[] }).ids;
      if (ids?.length) {
        toast.success(okMessage, {
          action: {
            label: 'Undo',
            onClick: () =>
              startTransition(async () => {
                await restoreRecognition(ids);
                router.refresh();
              }),
          },
        });
      } else {
        toast.success(okMessage);
      }
      router.refresh();
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Morning Meeting</h1>
          <p className="text-muted-foreground mt-1">
            {formatDate(`${today}T00:00:00.000Z`, 'EEEE, MMMM d')} &middot; the 7:15–7:45 walk-through
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">1 &middot; Recognition</Badge>
          <Badge variant="outline">2 &middot; Reminders</Badge>
          <Badge variant="outline">3 &middot; Policy of the Day</Badge>
        </div>
      </div>

      {/* ── 1. Recognition ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Read the names out
              </CardTitle>
              <CardDescription>
                {totalWins === 0
                  ? 'Nothing outstanding — every win has been read out.'
                  : `${totalWins} win${totalWins === 1 ? '' : 's'} across ${board.length} ${
                      board.length === 1 ? 'person' : 'people'
                    }${freshWins ? ` · ${freshWins} new` : ' · all carried over'}. They stay up until you dismiss them.`}
              </CardDescription>
            </div>
            {totalWins > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      dismissRecognition({
                        positiveIds: board.flatMap((g) => g.items.map((i) => i.id)),
                      }),
                    'Board cleared'
                  )
                }
              >
                <Check className="h-4 w-4" />
                Dismiss all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {board.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing new since the last meeting. Positives logged on{' '}
              <span className="font-medium text-foreground">Performance</span> land here the moment
              they&apos;re recorded.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {board.map((group) => (
                <div key={group.employee_id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{group.employee_name}</span>
                      {group.fresh_count > 0 && (
                        <Badge className="text-[10px]">{group.fresh_count} new</Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => dismissRecognition({ employeeId: group.employee_id }),
                          `${group.employee_name} dismissed`
                        )
                      }
                    >
                      <Check className="h-4 w-4" />
                      Dismiss
                    </Button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                          item.is_fresh ? 'bg-primary/5' : 'opacity-70'
                        }`}
                      >
                        <span className="mt-0.5 text-primary">{iconFor(item)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="font-medium">{item.type_label}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(item.event_date, 'EEE, MMM d')}
                              {item.job_customer ? ` · ${item.job_customer}` : ''}
                              {/* Credited later than it happened — say so, or an old
                                  date on a "new" win reads like a mistake. */}
                              {item.board_date !== item.event_date &&
                                ` · logged ${formatDate(item.board_date, 'MMM d')}`}
                            </span>
                          </div>
                          {item.note && (
                            <p className="text-muted-foreground">&ldquo;{item.note}&rdquo;</p>
                          )}
                          {item.awarded_by && (
                            <p className="text-xs text-muted-foreground">— {item.awarded_by}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          title="Dismiss just this one"
                          className="text-muted-foreground hover:text-foreground"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => dismissRecognition({ positiveIds: [item.id] }),
                              'Dismissed'
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Ad-hoc reminders ──────────────────────────────────────────── */}
      <RemindersLog
        todaysNotes={todaysNotes}
        earlierNotes={earlierNotes}
        policies={policies}
        pending={pending}
        run={run}
      />

      {/* ── 3. Policy of the day + the standing list ─────────────────────── */}
      <PolicySection
        today={today}
        policyOfDay={policyOfDay}
        policies={policies}
        history={history}
        pending={pending}
        run={run}
      />
    </div>
  );
}

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void
) => void;

function RemindersLog({
  todaysNotes,
  earlierNotes,
  policies,
  pending,
  run,
}: {
  todaysNotes: MeetingNote[];
  earlierNotes: MeetingNote[];
  policies: Policy[];
  pending: boolean;
  run: Run;
}) {
  const [body, setBody] = useState('');
  const [linkedId, setLinkedId] = useState('none');
  const [showEarlier, setShowEarlier] = useState(false);
  const [promoting, setPromoting] = useState<MeetingNote | null>(null);

  function submit() {
    if (!body.trim()) return;
    // Clear only once the write lands. Wiping the box up front loses whatever was
    // typed if the action fails — and it gets typed with a room waiting.
    run(
      () => addNote({ body, policyId: linkedId === 'none' ? undefined : linkedId }),
      'Reminder logged',
      () => {
        setBody('');
        setLinkedId('none');
      }
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            What came up this morning
          </CardTitle>
          <CardDescription>
            Log reminders as you give them. Anything you find yourself repeating can be saved as a
            policy, where it joins the rotation once you publish it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <textarea
              className={textareaClass}
              placeholder="e.g. Two trucks left without checking straps yesterday — check before roll-out."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter submits — this gets typed while a room waits.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={linkedId} onValueChange={setLinkedId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Link to a standing policy (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No policy link</SelectItem>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={submit} disabled={pending || !body.trim()}>
                Log reminder
              </Button>
              <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
            </div>
          </div>

          {todaysNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet today.</p>
          ) : (
            <ul className="space-y-2">
              {todaysNotes.map((note) => (
                <li key={note.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {note.author_name} · {format(new Date(note.created_at), 'h:mm a')}
                    </span>
                    {note.policy_title && (
                      <Badge variant="secondary" className="text-[10px]">
                        <BookOpen className="h-3 w-3" />
                        {note.policy_title}
                      </Badge>
                    )}
                    <span className="flex-1" />
                    {!note.policy_id && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setPromoting(note)}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Save as policy
                      </button>
                    )}
                    <button
                      type="button"
                      className="hover:text-destructive"
                      disabled={pending}
                      onClick={() => run(() => deleteNote(note.id), 'Reminder removed')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {earlierNotes.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setShowEarlier((v) => !v)}
              >
                {showEarlier ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Earlier meetings ({earlierNotes.length})
              </button>
              {showEarlier && (
                <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
                  {earlierNotes.map((note) => (
                    <li key={note.id} className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(note.meeting_date, 'MMM d')} ·{' '}
                      </span>
                      {note.body}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <PromoteDialog
        note={promoting}
        onClose={() => setPromoting(null)}
        pending={pending}
        run={run}
      />
    </>
  );
}

/**
 * Opened by the parent flipping `open`, which means Radix never fires
 * onOpenChange on the way in — seeding fields there left them blank. The form
 * lives in its own component, rendered only while open and keyed to the note, so
 * it mounts fresh with its state already seeded from props.
 */
function PromoteDialog({
  note,
  onClose,
  pending,
  run,
}: {
  note: MeetingNote | null;
  onClose: () => void;
  pending: boolean;
  run: Run;
}) {
  return (
    <Dialog
      open={!!note}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {note && (
          <PromoteForm key={note.id} note={note} onClose={onClose} pending={pending} run={run} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PromoteForm({
  note,
  onClose,
  pending,
  run,
}: {
  note: MeetingNote;
  onClose: () => void;
  pending: boolean;
  run: Run;
}) {
  // The note's first line is usually most of the way to a title.
  const [title, setTitle] = useState(note.body.split('\n')[0].slice(0, 80));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Save as a policy</DialogTitle>
        <DialogDescription>
          Saved as a <strong>draft</strong> on the Policies page, keeping this note as its text.
          Crew won&apos;t see it and it won&apos;t rotate until you word it properly and publish it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="promote-title">Title</Label>
          <Input
            id="promote-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short enough to say out loud"
          />
        </div>
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{note.body}</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={pending || !title.trim()}
          onClick={() => {
            run(() => promoteNote({ noteId: note.id, title }), 'Saved as a draft policy');
            onClose();
          }}
        >
          Save draft
        </Button>
      </DialogFooter>
    </>
  );
}

function PolicySection({
  today,
  policyOfDay,
  policies,
  history,
  pending,
  run,
}: {
  today: string;
  policyOfDay: PolicyOfDay;
  policies: Policy[];
  history: { meeting_date: string; title: string | null; pinned: boolean }[];
  pending: boolean;
  run: Run;
}) {
  const { policy } = policyOfDay;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Policy of the Day
            </CardTitle>
            <CardDescription>
              Auto-rotates through published policies, longest-uncovered first. Pin one to override.
            </CardDescription>
          </div>
          {/* Editing lives on the Policies page — one list, one place to change it. */}
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/policies">
              Manage policies
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!policy ? (
          <p className="text-sm text-muted-foreground">
            No published policies are in the rotation yet.{' '}
            <Link href="/admin/policies" className="underline">
              Add one on the Policies page
            </Link>{' '}
            and it starts rotating.
          </p>
        ) : (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{policyCategoryLabel(policy.category)}</Badge>
              <Badge variant={policyOfDay.pinned ? 'default' : 'outline'} className="text-[10px]">
                {policyOfDay.pinned ? 'Pinned for today' : 'Auto-rotated'}
              </Badge>
              {policy.needs_review && (
                <Badge variant="destructive" className="text-[10px]">
                  Unverified wording
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {policyOfDay.prior_times === 0
                  ? 'First time covered'
                  : `Covered ${policyOfDay.prior_times}× before · last on ${formatDate(
                      policyOfDay.prior_last_on,
                      'MMM d'
                    )}`}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-semibold">{policy.title}</h3>
            {policy.body_en && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{policy.body_en}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value=""
            onValueChange={(id) =>
              run(() => pinPolicyOfDay({ policyId: id, today }), 'Pinned for today')
            }
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Pin a different policy for today…" />
            </SelectTrigger>
            <SelectContent>
              {policies.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {policyOfDay.pinned && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => unpinPolicyOfDay(today), 'Back to the rotation')}
            >
              <PinOff className="h-4 w-4" />
              Back to rotation
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Recently covered: </span>
            {history
              .filter((h) => h.title)
              .map((h) => `${formatDate(h.meeting_date, 'MMM d')} — ${h.title}`)
              .join(' · ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
