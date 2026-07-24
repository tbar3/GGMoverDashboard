'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Star, AlertTriangle, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { BoardRow, BonusConfig } from '@/lib/bonus';
import { logPositive, logStrike, logWriteUp, voidStrike, deletePositive } from '@/lib/bonus-actions';

// Combined event menu — positives, strikes, and the write-up all in one dropdown,
// so back office logs the whole spectrum of the week from one place.
type Kind = 'positive' | 'strike' | 'writeup';
const EVENT_OPTIONS: { value: string; label: string; kind: Kind }[] = [
  { value: 'FIVE_STAR_REVIEW', label: '5-Star Review', kind: 'positive' },
  { value: 'CUSTOMER_CALLOUT', label: 'Customer Call-out', kind: 'positive' },
  { value: 'COMPLIANCE_PLUS', label: 'Compliance +', kind: 'positive' },
  { value: 'LATE', label: 'Late', kind: 'strike' },
  { value: 'NO_SHOW', label: 'No-Show', kind: 'strike' },
  { value: 'TRUCK_NOT_READY', label: 'Truck Not Ready', kind: 'strike' },
  { value: 'WRITE_UP', label: 'Write-Up', kind: 'writeup' },
];
const labelFor = (v: string) => EVENT_OPTIONS.find((o) => o.value === v)?.label ?? v;
const kindFor = (v: string) => EVENT_OPTIONS.find((o) => o.value === v)?.kind;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface FlatEvent {
  id: string;
  kind: Kind;
  employeeName: string;
  type: string;
  date: string;
  note: string | null;
  voided?: boolean;
  voidReason?: string | null;
}

export default function PerformanceBoard({
  board,
  employees,
  weekStart,
  weekLabel,
  isCurrentWeek,
  prevWeek,
  nextWeek,
  config,
}: {
  board: BoardRow[];
  employees: { id: string; name: string }[];
  weekStart: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  prevWeek: string;
  nextWeek: string;
  config: BonusConfig;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDate, setEventDate] = useState(localToday());
  const [note, setNote] = useState('');

  const kind = kindFor(eventType);

  function reset() {
    setEventType('');
    setNote('');
  }

  function submit() {
    if (!employeeId) return toast.error('Pick a crew member');
    if (!eventType) return toast.error('Pick an event type');
    if (kind === 'writeup' && !note.trim()) return toast.error('A write-up needs a summary');

    startTransition(async () => {
      let res: { ok: boolean; error?: string };
      if (kind === 'positive') {
        res = await logPositive({ employeeId, type: eventType, eventDate, note });
      } else if (kind === 'strike') {
        res = await logStrike({ employeeId, type: eventType, eventDate, note });
      } else {
        res = await logWriteUp({ employeeId, eventDate, summary: note });
      }
      if (res.ok) {
        toast.success(`Logged ${labelFor(eventType)}`);
        reset();
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not log the event');
      }
    });
  }

  function onVoid(id: string) {
    const reason = window.prompt('Reason for voiding this strike? (recorded for the audit trail)');
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      const res = await voidStrike(id, reason);
      if (res.ok) {
        toast.success('Strike voided — the week will recompute');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not void the strike');
      }
    });
  }

  function onDeletePositive(id: string) {
    startTransition(async () => {
      const res = await deletePositive(id);
      if (res.ok) {
        toast.success('Positive removed');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not remove');
      }
    });
  }

  // Flatten the board into one chronological event feed for the week.
  const feed: FlatEvent[] = [];
  for (const row of board) {
    for (const p of row.events.positives) {
      feed.push({ id: p.id, kind: 'positive', employeeName: row.name, type: p.type, date: p.event_date, note: p.note });
    }
    for (const s of row.events.strikes) {
      feed.push({ id: s.id, kind: 'strike', employeeName: row.name, type: s.type, date: s.event_date, note: s.note, voided: s.voided, voidReason: s.void_reason });
    }
    for (const w of row.events.writeUps) {
      feed.push({ id: w.id, kind: 'writeup', employeeName: row.name, type: 'WRITE_UP', date: w.event_date, note: w.summary });
    }
  }
  feed.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance</h1>
          <p className="text-muted-foreground mt-1">
            Positives lift the weekly bonus multiplier; any strike forfeits the week.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/performance?week=${prevWeek}`}>
            <Button variant="outline" size="icon" aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="font-semibold min-w-[11rem] text-center">
            {weekLabel}
            {isCurrentWeek && <span className="text-muted-foreground font-normal"> · this week</span>}
          </span>
          <Link href={`/admin/performance?week=${nextWeek}`}>
            <Button variant="outline" size="icon" aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Log an event */}
      <Card>
        <CardHeader>
          <CardTitle>Log an event</CardTitle>
          <CardDescription>
            Positives stack (+{config.increment}× each). Strikes zero the whole week. A review that
            names someone is two positives — the 5-star and the call-out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1.5">
              <Label>Crew member</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Event</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                      {o.kind === 'positive' && ' ▲'}
                      {o.kind === 'strike' && ' ✕'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{kind === 'writeup' ? 'Summary (required)' : 'Note (optional)'}</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={kind === 'writeup' ? 'What happened' : 'e.g. named in review'}
              />
            </div>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Saving…' : 'Log event'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly board */}
      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s board</CardTitle>
          <CardDescription>
            Multiplier = {config.baseMultiplier} + {config.increment} × positives. Perfect Week and
            bonus dollars activate once the weekly payroll &amp; attendance import lands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew member</TableHead>
                <TableHead className="text-center">Positives</TableHead>
                <TableHead className="text-center">Strikes</TableHead>
                <TableHead className="text-center">Perfect week</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.map((row) => {
                const activeStrikes = row.events.strikes.filter((s) => !s.voided).length;
                return (
                  <TableRow key={row.employeeId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">
                      {row.result.positivesCount || <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {activeStrikes > 0 ? (
                        <Badge variant="destructive">{activeStrikes}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.result.perfectWeek ? (
                        <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Perfect</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.result.hasStrike ? (
                        <span className="text-destructive font-semibold">FORFEIT</span>
                      ) : (
                        `${row.result.multiplier}×`
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.result.hasStrike ? (
                        <span className="text-destructive font-semibold">{money(0)}</span>
                      ) : row.result.hours > 0 ? (
                        money(row.result.bonus)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Event feed */}
      <Card>
        <CardHeader>
          <CardTitle>Events this week</CardTitle>
          <CardDescription>{feed.length} logged</CardDescription>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nothing logged for this week yet.
            </p>
          ) : (
            <ul className="divide-y">
              {feed.map((ev) => (
                <li key={`${ev.kind}-${ev.id}`} className="flex items-center gap-3 py-2.5">
                  <EventIcon kind={ev.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{ev.employeeName}</span>
                      <span className="text-sm">{labelFor(ev.type)}</span>
                      {ev.voided && (
                        <Badge variant="outline" className="text-muted-foreground">
                          voided
                        </Badge>
                      )}
                    </div>
                    {ev.note && (
                      <p className="text-sm text-muted-foreground truncate">
                        {ev.note}
                        {ev.voided && ev.voidReason ? ` · void: ${ev.voidReason}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(`${ev.date}T12:00:00`), 'EEE MMM d')}
                  </span>
                  {ev.kind === 'strike' && !ev.voided && (
                    <Button variant="outline" size="sm" onClick={() => onVoid(ev.id)} disabled={pending}>
                      Void
                    </Button>
                  )}
                  {ev.kind === 'positive' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeletePositive(ev.id)}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventIcon({ kind }: { kind: Kind }) {
  if (kind === 'positive')
    return <Star className="h-4 w-4 shrink-0 text-sky-600" aria-label="positive" />;
  if (kind === 'strike')
    return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="strike" />;
  return <FileWarning className="h-4 w-4 shrink-0 text-amber-600" aria-label="write-up" />;
}
