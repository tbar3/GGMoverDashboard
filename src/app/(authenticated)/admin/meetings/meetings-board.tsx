'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CalendarClock, Check, Trash2, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  MEETING_TYPES,
  meetingTypeLabel,
  quarterLabel,
  type CrewMeeting,
  type DueCrewMember,
  type MeetingTarget,
  type MeetingType,
} from '@/lib/crew-meetings-shared';
import {
  scheduleMeeting,
  completeMeeting,
  rescheduleMeeting,
  deleteMeeting,
} from '@/lib/crew-meetings-actions';

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const textareaClass =
  'w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** '08:00' → '8:00 AM'. Already wall-clock, so no date is involved. */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void
) => void;

/**
 * Crew meetings.
 *
 * Reads in the order the problem runs: who you owe a quarterly sit-down, what is
 * already booked, and what was actually said in the ones you have held.
 */
export default function MeetingsBoard({
  quarter,
  due,
  scheduled,
  recent,
  targets,
}: {
  quarter: { quarter: string; start: string; end: string };
  due: DueCrewMember[];
  scheduled: CrewMeeting[];
  recent: CrewMeeting[];
  targets: MeetingTarget[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRecent, setShowRecent] = useState(false);

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
      toast.success(okMessage);
      router.refresh();
    });
  }

  const overdue = due.filter((d) => d.status === 'overdue').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Crew Meetings</h1>
        <p className="text-muted-foreground mt-1">
          {quarterLabel(quarter.quarter)} · {formatDate(quarter.start, 'MMM d')} –{' '}
          {formatDate(quarter.end, 'MMM d')} ·{' '}
          {due.length === 0
            ? 'everyone has their review booked'
            : `${due.length} still to book${overdue > 0 ? ` · ${overdue} overdue` : ''}`}
        </p>
      </div>

      {/* ── 1. Due this quarter ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Quarterly reviews due
          </CardTitle>
          <CardDescription>
            Crew with no review booked for {quarterLabel(quarter.quarter)}. Anyone hired this
            quarter is left out — they get the 30-day evaluation instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {due.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody outstanding. Every active crew member has this quarter&apos;s review booked or
              done.
            </p>
          ) : (
            <ul className="space-y-2">
              {due.map((person) => (
                <DueRow key={person.employee_id} person={person} pending={pending} run={run} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Book anything, with anyone ────────────────────────────────── */}
      <BookMeeting targets={targets} pending={pending} run={run} />

      {/* ── 3. Booked and not yet held ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Coming up
          </CardTitle>
          <CardDescription>
            Record what was said as soon as you finish — that record is what makes a repeat problem
            visible months later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing booked.</p>
          ) : (
            scheduled.map((m) => (
              <ScheduledMeeting key={m.id} meeting={m} pending={pending} run={run} />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── 4. What was said ─────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <button
              type="button"
              className="flex items-center gap-1 text-left"
              onClick={() => setShowRecent((v) => !v)}
            >
              {showRecent ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <CardTitle>Held recently ({recent.length})</CardTitle>
            </button>
          </CardHeader>
          {showRecent && (
            <CardContent>
              <ul className="space-y-3">
                {recent.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.employee_name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {meetingTypeLabel(m.type)}
                      </Badge>
                      {m.quarter && (
                        <Badge variant="outline" className="text-[10px]">
                          {quarterLabel(m.quarter)}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {m.completed_at && formatDate(m.completed_at, 'MMM d, yyyy')}
                        {m.completed_by_name ? ` · ${m.completed_by_name}` : ''}
                      </span>
                    </div>
                    {m.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

/** One crew member owed a review, with the inline booking form. */
function DueRow({
  person,
  pending,
  run,
}: {
  person: DueCrewMember;
  pending: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{person.employee_name}</span>
        <Badge variant="outline" className="text-[10px] capitalize">
          {person.role}
        </Badge>
        {person.status === 'overdue' && (
          <Badge className="bg-destructive text-destructive-foreground text-[10px]">Overdue</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {person.last_review_on
            ? `last review ${formatDate(person.last_review_on, 'MMM yyyy')}`
            : 'no review on record'}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Book review'}
        </Button>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <input
              type="date"
              className={`${inputClass} w-44`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Time (optional)</Label>
            <input
              type="time"
              className={`${inputClass} w-32`}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={pending || !date}
            onClick={() =>
              run(
                () =>
                  scheduleMeeting({
                    employeeId: person.employee_id,
                    type: 'quarterly_review',
                    scheduledFor: date,
                    scheduledTime: time,
                  }),
                'Review booked',
                () => setOpen(false)
              )
            }
          >
            Book it
          </Button>
        </div>
      )}
    </li>
  );
}

/** Book any meeting with anyone — the ad-hoc half of the module. */
function BookMeeting({
  targets,
  pending,
  run,
}: {
  targets: MeetingTarget[];
  pending: boolean;
  run: Run;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<MeetingType>('catch_up');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const hint = MEETING_TYPES.find((t) => t.value === type)?.hint;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book a meeting</CardTitle>
        <CardDescription>
          Anyone on the roster, office included — feedback worth saying out loud, a problem worth
          naming, or just a catch-up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Who</Label>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Pick someone…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.role ? ` · ${t.role}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">What for</Label>
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as MeetingType)}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Time (optional)</Label>
            <input
              type="time"
              className={inputClass}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || !employeeId || !date}
            onClick={() =>
              run(
                () =>
                  scheduleMeeting({
                    employeeId,
                    type,
                    scheduledFor: date,
                    scheduledTime: time,
                  }),
                'Meeting booked',
                () => {
                  setEmployeeId('');
                  setDate('');
                  setTime('');
                }
              )
            }
          >
            Book it
          </Button>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** A booked meeting: complete it with notes, move it, or drop it. */
function ScheduledMeeting({
  meeting,
  pending,
  run,
}: {
  meeting: CrewMeeting;
  pending: boolean;
  run: Run;
}) {
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState('');
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(meeting.scheduled_for);
  const [time, setTime] = useState(meeting.scheduled_time ?? '');

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{meeting.employee_name}</span>
        <Badge variant="secondary" className="text-[10px]">
          {meetingTypeLabel(meeting.type)}
        </Badge>
        {meeting.quarter && (
          <Badge variant="outline" className="text-[10px]">
            {quarterLabel(meeting.quarter)}
          </Badge>
        )}
        <span className="text-muted-foreground">
          {formatDate(meeting.scheduled_for, 'EEE, MMM d')}
          {meeting.scheduled_time ? ` at ${formatTime(meeting.scheduled_time)}` : ''}
        </span>
        <span className="flex-1" />
        {!completing && (
          <Button size="sm" onClick={() => setCompleting(true)}>
            <Check className="h-4 w-4" />
            Record it
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMoving((v) => !v)}>
          Move
        </Button>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          disabled={pending}
          title="Delete this meeting"
          onClick={() => run(() => deleteMeeting(meeting.id), 'Meeting removed')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {moving && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <input
            type="date"
            className={`${inputClass} w-44`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="time"
            className={`${inputClass} w-32`}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !date}
            onClick={() =>
              run(
                () => rescheduleMeeting({ id: meeting.id, scheduledFor: date, scheduledTime: time }),
                'Moved',
                () => setMoving(false)
              )
            }
          >
            Save
          </Button>
        </div>
      )}

      {completing && (
        <div className="mt-2 space-y-2">
          <textarea
            className={textareaClass}
            placeholder="What was said? One line is enough — but there has to be one."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending || !notes.trim()}
              onClick={() =>
                run(
                  () => completeMeeting({ id: meeting.id, notes }),
                  'Recorded',
                  () => {
                    setNotes('');
                    setCompleting(false);
                  }
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCompleting(false);
                setNotes('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
