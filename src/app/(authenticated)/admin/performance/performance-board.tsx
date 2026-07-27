'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
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
import { ChevronLeft, ChevronRight, Star, Sparkles, AlertTriangle, FileWarning, Lock, LockOpen, Download, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { BoardRow, BonusConfig, WeekStatus, SnapshotRow, AdjustmentRow, JobCrewOption } from '@/lib/bonus';
import {
  logPositive,
  logGGPoint,
  logStrike,
  logWriteUp,
  logGroupEvent,
  saveJobCrew,
  voidStrike,
  deletePositive,
  approveWeek,
  reopenWeek,
  addAdjustment,
  deleteAdjustment,
} from '@/lib/bonus-actions';

// Combined event menu — positives, the discretionary GG Point, strikes, and the
// write-up all in one dropdown, so back office logs the whole spectrum from here.
type Kind = 'positive' | 'discretionary' | 'strike' | 'writeup';
const EVENT_OPTIONS: { value: string; label: string; kind: Kind }[] = [
  { value: 'FIVE_STAR_REVIEW', label: '5-Star Review (whole crew)', kind: 'positive' },
  { value: 'CUSTOMER_CALLOUT', label: 'Customer Shoutout', kind: 'positive' },
  { value: 'COMPLIANCE_PLUS', label: 'Compliance Plus (audit pass)', kind: 'positive' },
  { value: 'GG_POINT', label: 'GG Point (discretionary)', kind: 'discretionary' },
  { value: 'LATE', label: 'Late', kind: 'strike' },
  { value: 'CALL_OUT', label: 'Call-Out (after Sun 3PM)', kind: 'strike' },
  { value: 'NO_SHOW', label: 'No-Show', kind: 'strike' },
  { value: 'TOOLS', label: 'No Tools (lead/driver)', kind: 'strike' },
  { value: 'UNIFORM', label: 'Uniform', kind: 'strike' },
  { value: 'ARRIVAL_WINDOW', label: 'Missed Arrival Window', kind: 'strike' },
  { value: 'NON_COMPLIANCE', label: 'Failed Audit (<70%)', kind: 'strike' },
  { value: 'TRUCK_NOT_READY', label: 'Truck Not Ready (whole crew)', kind: 'strike' },
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
  // Group-event (whole-crew-by-job) form. Date-driven: pick any date, load its
  // jobs, then edit the auto-populated crew before logging.
  const [groupDate, setGroupDate] = useState(localToday());
  const [groupJobs, setGroupJobs] = useState<JobCrewOption[]>([]);
  const [groupJobsLoading, setGroupJobsLoading] = useState(false);
  const [groupJobId, setGroupJobId] = useState('');
  const [groupCrew, setGroupCrew] = useState<{ id: string; name: string }[]>([]);
  const [addMemberId, setAddMemberId] = useState('');
  const [groupType, setGroupType] = useState('');
  const [groupNote, setGroupNote] = useState('');

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
      } else if (kind === 'discretionary') {
        res = await logGGPoint({ employeeId, eventDate, note });
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

  const groupKind = kindFor(groupType);
  const selectedJob = groupJobs.find((j) => j.id === groupJobId);

  // Load jobs whenever the chosen date changes (any date, past or future).
  const loadGroupJobs = useCallback(async (date: string) => {
    setGroupJobsLoading(true);
    try {
      const res = await fetch(`/api/jobs/by-date?date=${date}`);
      const data: JobCrewOption[] = res.ok ? await res.json() : [];
      setGroupJobs(data);
    } catch {
      setGroupJobs([]);
    } finally {
      setGroupJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroupJobs(groupDate);
    setGroupJobId('');
    setGroupCrew([]);
  }, [groupDate, loadGroupJobs]);

  // When a job is picked, auto-populate its crew into the editable list.
  function pickGroupJob(id: string) {
    setGroupJobId(id);
    const job = groupJobs.find((j) => j.id === id);
    setGroupCrew(job ? [...job.crew] : []);
    setAddMemberId('');
  }

  function removeCrew(id: string) {
    setGroupCrew((c) => c.filter((m) => m.id !== id));
  }

  function addCrew(id: string) {
    if (!id) return;
    const emp = employees.find((e) => e.id === id);
    if (emp && !groupCrew.some((m) => m.id === id)) {
      setGroupCrew((c) => [...c, { id: emp.id, name: emp.name }]);
    }
    setAddMemberId('');
  }

  function onSaveCrew() {
    if (!groupJobId) return toast.error('Pick a job');
    startTransition(async () => {
      const res = await saveJobCrew(groupJobId, groupCrew.map((m) => m.id));
      if (res.ok) {
        toast.success('Crew saved to the job');
        loadGroupJobs(groupDate);
      } else toast.error(res.error ?? 'Could not save crew');
    });
  }

  function submitGroup() {
    if (!groupJobId) return toast.error('Pick a job');
    if (!groupType) return toast.error('Pick an event type');
    if (groupCrew.length === 0) return toast.error('Add at least one crew member');
    const gk = kindFor(groupType);
    if (gk === 'writeup') return toast.error('Write-ups are logged individually');
    startTransition(async () => {
      const res = await logGroupEvent({
        jobId: groupJobId,
        employeeIds: groupCrew.map((m) => m.id),
        kind: gk as 'positive' | 'discretionary' | 'strike',
        type: groupType,
        eventDate: groupDate,
        note: groupNote,
      });
      if (res.ok) {
        toast.success(`Logged ${labelFor(groupType)} for ${res.count} crew`);
        setGroupType('');
        setGroupNote('');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not log the group event');
      }
    });
  }

  const addableEmployees = employees.filter((e) => !groupCrew.some((m) => m.id === e.id));

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
      feed.push({
        id: p.id,
        kind: p.discretionary ? 'discretionary' : 'positive',
        employeeName: row.name,
        type: p.type,
        date: p.event_date,
        note: p.note,
      });
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
            Each +{config.increment}× is a <span className="font-medium">GG Point</span>. Positives
            stack and a strike forfeits them. A <span className="font-medium">discretionary GG Point</span>{' '}
            is strike-proof — a strike drops the normal bonus but the GG Point&apos;s {config.increment}×
            is kept, unless the week has {config.forfeitThreshold}+ strikes (then everything is lost).
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
                      {o.kind === 'discretionary' && ' ✦'}
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

      {/* Group event — apply one event to a whole job's crew at once */}
      {!locked && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Group event (whole crew)
          </CardTitle>
          <CardDescription>
            Pick a date and job, then log a whole-crew event once — Truck Not Ready, 5-Star Review,
            Compliance Plus, etc. The crew auto-fills; edit or add members if the sync missed anyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={groupDate} onChange={(e) => setGroupDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Job</Label>
              <Select value={groupJobId} onValueChange={pickGroupJob} disabled={groupJobsLoading}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      groupJobsLoading
                        ? 'Loading…'
                        : groupJobs.length === 0
                          ? 'No jobs on this date'
                          : 'Select a job…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.startTime ? `${j.startTime} · ` : ''}
                      {j.jobNumber ? `#${j.jobNumber} · ` : ''}
                      {j.customer ?? 'Job'} ({j.crew.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedJob && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Crew ({groupCrew.length})</p>
                <Button size="sm" variant="ghost" onClick={onSaveCrew} disabled={pending}>
                  Save crew to job
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupCrew.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No crew yet — add members below.
                  </span>
                ) : (
                  groupCrew.map((m) => (
                    <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                      {m.name}
                      <button
                        type="button"
                        onClick={() => removeCrew(m.id)}
                        className="ml-0.5 rounded hover:bg-muted-foreground/20"
                        aria-label={`Remove ${m.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <div className="w-full sm:w-72">
                <Select value={addMemberId} onValueChange={addCrew}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add a crew member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {addableEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <div className="space-y-1.5">
              <Label>Event</Label>
              <Select value={groupType} onValueChange={setGroupType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.filter((o) => o.kind !== 'writeup').map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                      {o.kind === 'positive' && ' ▲'}
                      {o.kind === 'discretionary' && ' ✦'}
                      {o.kind === 'strike' && ' ✕'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={groupNote}
                onChange={(e) => setGroupNote(e.target.value)}
                placeholder="e.g. tailgate left open"
              />
            </div>
            <Button onClick={submitGroup} disabled={pending || !groupJobId || !groupType || groupCrew.length === 0}>
              {pending ? 'Saving…' : `Apply to crew (${groupCrew.length})`}
            </Button>
          </div>
          {selectedJob && groupType && (
            <p className="text-xs text-muted-foreground">
              {labelFor(groupType)} → {groupCrew.map((m) => m.name).join(', ') || '—'}
              {groupKind === 'strike' && (
                <span className="text-destructive"> · counts as a strike for each</span>
              )}
            </p>
          )}
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
                      {row.multiplier === 0 ? (
                        <span className="text-destructive font-semibold">FORFEIT</span>
                      ) : row.hasStrike ? (
                        <span className="text-amber-600 font-semibold" title="Normal bonus forfeited; GG Points retained">
                          {row.multiplier}×
                        </span>
                      ) : (
                        `${row.multiplier}×`
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.multiplier === 0 ? (
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
                            {money(row.bonus + adj)}
                          </span>
                        ) : (
                          money(row.bonus)
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
                  {!locked && (ev.kind === 'positive' || ev.kind === 'discretionary') && (
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
  if (kind === 'discretionary')
    return <Sparkles className="h-4 w-4 shrink-0 text-violet-600" aria-label="GG Point" />;
  if (kind === 'strike')
    return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="strike" />;
  return <FileWarning className="h-4 w-4 shrink-0 text-amber-600" aria-label="write-up" />;
}
