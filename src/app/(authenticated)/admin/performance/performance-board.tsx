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
import { ChevronLeft, ChevronRight, Star, AlertTriangle, FileWarning, Lock, LockOpen, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { BoardRow, BonusConfig, WeekStatus, SnapshotRow, AdjustmentRow } from '@/lib/bonus';
import {
  logPositive,
  logStrike,
  logWriteUp,
  voidStrike,
  deletePositive,
  approveWeek,
  reopenWeek,
  addAdjustment,
  deleteAdjustment,
} from '@/lib/bonus-actions';

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
  weekStatus,
  lockedResults,
  adjustments,
}: {
  board: BoardRow[];
  employees: { id: string; name: string }[];
  weekStart: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  prevWeek: string;
  nextWeek: string;
  config: BonusConfig;
  weekStatus: WeekStatus;
  lockedResults: SnapshotRow[];
  adjustments: AdjustmentRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventDate, setEventDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [adjEmp, setAdjEmp] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'bonus'>('name');

  const locked = weekStatus.status === 'approved';

  // Sum of adjustments per employee, for the net-bonus display + export preview.
  const adjByEmp = new Map<string, number>();
  for (const a of adjustments) adjByEmp.set(a.employeeId, (adjByEmp.get(a.employeeId) ?? 0) + a.delta);

  function onApprove() {
    if (!window.confirm('Lock this week? Hours, positives, strikes, and the bonus will be frozen.')) return;
    startTransition(async () => {
      const res = await approveWeek(weekStart);
      if (res.ok) {
        toast.success('Week locked');
        router.refresh();
      } else toast.error(res.error ?? 'Could not lock the week');
    });
  }

  function onReopen() {
    if (!window.confirm('Reopen this week for editing? The frozen snapshot will be cleared.')) return;
    startTransition(async () => {
      const res = await reopenWeek(weekStart);
      if (res.ok) {
        toast.success('Week reopened');
        router.refresh();
      } else toast.error(res.error ?? 'Could not reopen');
    });
  }

  function onAddAdjustment() {
    if (!adjEmp) return toast.error('Pick a crew member');
    startTransition(async () => {
      const res = await addAdjustment({ weekStart, employeeId: adjEmp, delta: adjAmount, reason: adjReason });
      if (res.ok) {
        toast.success('Adjustment added');
        setAdjEmp('');
        setAdjAmount('');
        setAdjReason('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add adjustment');
    });
  }

  function onDeleteAdjustment(id: string) {
    startTransition(async () => {
      const res = await deleteAdjustment(id);
      if (res.ok) {
        toast.success('Adjustment removed');
        router.refresh();
      } else toast.error(res.error ?? 'Could not remove');
    });
  }

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

  // Unify the board rows: frozen snapshot when locked, live compute when open.
  const displayRows = locked
    ? lockedResults.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        positivesCount: r.positivesCount,
        activeStrikes: r.hasStrike ? 1 : 0,
        perfectWeek: r.perfectWeek,
        multiplier: r.multiplier,
        hasStrike: r.hasStrike,
        hours: r.hours,
        hasHours: r.hours > 0,
        bonus: r.bonus,
      }))
    : board.map((row) => ({
        employeeId: row.employeeId,
        name: row.name,
        positivesCount: row.result.positivesCount,
        activeStrikes: row.events.strikes.filter((s) => !s.voided).length,
        perfectWeek: row.result.perfectWeek,
        multiplier: row.result.multiplier,
        hasStrike: row.result.hasStrike,
        hours: row.result.hours,
        hasHours: row.result.hours > 0,
        bonus: row.result.bonus,
      }));

  // Dispatch view: sort by last week's earned bonus, highest first.
  const sortedRows =
    sortBy === 'bonus'
      ? [...displayRows].sort((a, b) => (b.hasStrike ? 0 : b.bonus) - (a.hasStrike ? 0 : a.bonus))
      : displayRows;

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

      {/* Week close status */}
      <Card className={locked ? 'border-primary' : ''}>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {locked ? (
              <Lock className="h-5 w-5 text-primary" />
            ) : (
              <LockOpen className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold">{locked ? 'Week locked' : 'Week open'}</p>
              <p className="text-sm text-muted-foreground">
                {locked
                  ? `Frozen${weekStatus.approvedByName ? ` by ${weekStatus.approvedByName}` : ''}${
                      weekStatus.approvedAt ? ` · ${format(new Date(weekStatus.approvedAt), 'MMM d, h:mm a')}` : ''
                    }`
                  : 'Review the board, then lock the week to freeze it for payroll.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locked ? (
              <>
                <a href={`/api/bonus/export?week=${weekStart}`}>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-1.5" /> Export CSV
                  </Button>
                </a>
                <Button variant="outline" onClick={onReopen} disabled={pending}>
                  <LockOpen className="h-4 w-4 mr-1.5" /> Reopen
                </Button>
              </>
            ) : (
              <Button onClick={onApprove} disabled={pending}>
                <Lock className="h-4 w-4 mr-1.5" /> Approve &amp; lock week
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log an event — only while the week is open */}
      {!locked && (
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
      )}

      {/* Weekly board */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{locked ? 'Locked board' : "This week's board"}</CardTitle>
              <CardDescription>
                {locked
                  ? 'Frozen figures from lock time. Corrections go through adjustments below.'
                  : `Multiplier = ${config.baseMultiplier} + ${config.increment} × positives. Perfect Week and bonus dollars activate once the weekly payroll & attendance import lands.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">Sort</span>
              <Button
                size="sm"
                variant={sortBy === 'name' ? 'default' : 'outline'}
                onClick={() => setSortBy('name')}
              >
                Name
              </Button>
              <Button
                size="sm"
                variant={sortBy === 'bonus' ? 'default' : 'outline'}
                onClick={() => setSortBy('bonus')}
              >
                Bonus (high→low)
              </Button>
            </div>
          </div>
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
                {locked && <TableHead className="text-right">Net</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => {
                const adj = adjByEmp.get(row.employeeId) ?? 0;
                return (
                  <TableRow key={row.employeeId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">
                      {row.positivesCount || <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.hasStrike ? (
                        <Badge variant="destructive">{row.activeStrikes || 1}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.perfectWeek ? (
                        <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Perfect</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.hasStrike ? (
                        <span className="text-destructive font-semibold">FORFEIT</span>
                      ) : (
                        `${row.multiplier}×`
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hasStrike ? (
                        <span className="text-destructive font-semibold">{money(0)}</span>
                      ) : row.hasHours ? (
                        money(row.bonus)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {locked && (
                      <TableCell className="text-right font-semibold">
                        {adj !== 0 ? (
                          <span title={`bonus ${money(row.bonus)} ${adj > 0 ? '+' : '−'} ${money(Math.abs(adj))}`}>
                            {money((row.hasStrike ? 0 : row.bonus) + adj)}
                          </span>
                        ) : (
                          money(row.hasStrike ? 0 : row.bonus)
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjustments — only on a locked week */}
      {locked && (
        <Card>
          <CardHeader>
            <CardTitle>Adjustments</CardTitle>
            <CardDescription>
              Corrections after lock. Each is a signed amount with a reason and shows up as its own
              line on the payroll export.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <div className="space-y-1.5">
                <Label>Crew member</Label>
                <Select value={adjEmp} onValueChange={setAdjEmp}>
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
                <Label>Amount (+ / −)</Label>
                <Input
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="e.g. 15 or -10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Input
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Why"
                />
              </div>
              <Button onClick={onAddAdjustment} disabled={pending}>
                Add adjustment
              </Button>
            </div>
            {adjustments.length > 0 && (
              <ul className="divide-y">
                {adjustments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <span className="font-medium">{a.name}</span>
                    <span className={a.delta < 0 ? 'text-destructive' : 'text-green-600'}>
                      {a.delta < 0 ? '−' : '+'}
                      {money(Math.abs(a.delta))}
                    </span>
                    <span className="text-sm text-muted-foreground flex-1 truncate">{a.reason}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteAdjustment(a.id)}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

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
                  {!locked && ev.kind === 'strike' && !ev.voided && (
                    <Button variant="outline" size="sm" onClick={() => onVoid(ev.id)} disabled={pending}>
                      Void
                    </Button>
                  )}
                  {!locked && ev.kind === 'positive' && (
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
