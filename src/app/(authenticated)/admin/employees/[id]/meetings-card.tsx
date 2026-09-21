'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CalendarClock, Check } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  MEETING_TYPES,
  meetingTypeLabel,
  quarterLabel,
  type CrewMeeting,
  type MeetingType,
} from '@/lib/crew-meetings-shared';
import { scheduleMeeting, completeMeeting } from '@/lib/crew-meetings-actions';

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const textareaClass =
  'w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * One person's meeting history, on their employee page.
 *
 * The same record the meetings board holds, shown where you are already looking
 * when you ask "how is this person doing?" — which is the question a run of
 * recorded conversations actually answers.
 */
export function MeetingsCard({
  employeeId,
  meetings,
}: {
  employeeId: string;
  meetings: CrewMeeting[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [booking, setBooking] = useState(false);
  const [type, setType] = useState<MeetingType>('catch_up');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string, after?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      after?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  const upcoming = meetings.filter((m) => !m.completed_at);
  const held = meetings.filter((m) => m.completed_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Meetings
            </CardTitle>
            <CardDescription>
              Quarterly reviews, feedback and catch-ups — what was booked, and what was said.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBooking((v) => !v)}>
            {booking ? 'Cancel' : 'Book one'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {booking && (
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
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
            <div className="sm:col-span-3">
              <Button
                size="sm"
                disabled={pending || !date}
                onClick={() =>
                  run(
                    () =>
                      scheduleMeeting({
                        employeeId,
                        type,
                        scheduledFor: date,
                        scheduledTime: time,
                      }),
                    'Booked',
                    () => {
                      setBooking(false);
                      setDate('');
                      setTime('');
                    }
                  )
                }
              >
                Book it
              </Button>
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="space-y-2">
            {upcoming.map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {meetingTypeLabel(m.type)}
                  </Badge>
                  {m.quarter && (
                    <Badge variant="outline" className="text-[10px]">
                      {quarterLabel(m.quarter)}
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {formatDate(m.scheduled_for, 'EEE, MMM d')}
                  </span>
                  <span className="flex-1" />
                  {completingId !== m.id && (
                    <Button size="sm" onClick={() => setCompletingId(m.id)}>
                      <Check className="h-4 w-4" />
                      Record it
                    </Button>
                  )}
                </div>
                {completingId === m.id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className={textareaClass}
                      placeholder="What was said? One line is enough."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending || !notes.trim()}
                        onClick={() =>
                          run(() => completeMeeting({ id: m.id, notes }), 'Recorded', () => {
                            setNotes('');
                            setCompletingId(null);
                          })
                        }
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCompletingId(null);
                          setNotes('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {held.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {upcoming.length === 0
              ? 'No meetings on record yet.'
              : 'Nothing held yet — the record starts with the first one.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {held.map((m) => (
              <li key={m.id} className="border-l-2 border-border pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{meetingTypeLabel(m.type)}</span>
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
                  <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{m.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
