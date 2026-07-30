'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Trophy,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export interface ScoreRow {
  employeeId: string;
  name: string;
  role: string;
  positives: number;
  strikes: number;
  writeUps: number;
  multiplier: number;
  score: number;
}

type SortKey = 'score' | 'name' | 'role' | 'positives' | 'strikes';

function scoreClass(score: number): string {
  if (score < 0) return 'text-red-600 font-bold';
  if (score === 0) return 'text-amber-600 font-semibold';
  if (score >= 1) return 'text-emerald-600 font-bold';
  return 'text-foreground font-semibold';
}

export function ScoreboardTable({
  rows,
  weekLabel,
  isCurrentWeek,
  prevWeek,
  nextWeek,
}: {
  rows: ScoreRow[];
  weekLabel: string;
  isCurrentWeek: boolean;
  prevWeek: string;
  nextWeek: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false); // score defaults high→low (best first)
  const [view, setView] = useState<'board' | 'eligible'>('board');

  // "Still eligible" = no strikes this week. A single strike forfeits the normal
  // bonus, so a clean sheet is what keeps a crew member in the running.
  const eligible = useMemo(
    () => rows.filter((r) => r.strikes === 0).sort((a, b) => a.name.localeCompare(b.name)),
    [rows]
  );

  // Fixed rank by score (1 = best), independent of how the table is sorted.
  const rankById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.employeeId, rows.filter((o) => o.score > r.score).length + 1);
    }
    return m;
  }, [rows]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name' || sortKey === 'role') {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      // Stable tiebreak: better score, then name.
      if (cmp === 0 && sortKey !== 'score') cmp = b.score - a.score;
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return cmp * dir;
    });
  }, [rows, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      // Sensible default direction per column: names A→Z, numbers high→low.
      setAsc(key === 'name' || key === 'role');
    }
  }

  const SortHead = ({
    label,
    k,
    className,
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`Sort by ${label}`}
      >
        {label}
        <ArrowUpDown
          className={cn('h-3.5 w-3.5', sortKey === k ? 'text-foreground' : 'text-muted-foreground/50')}
        />
      </button>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-3">
        <Trophy className="mt-1 h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Scoreboard</h1>
          <p className="text-muted-foreground mt-1">
            One score per crew member, best to worst — to prioritize next week&apos;s jobs.
          </p>
        </div>
      </div>

      {/* View toggle: full scoreboard vs. the crew-facing "still eligible" list */}
      <div className="inline-flex rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setView('board')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'board'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Trophy className="h-4 w-4" />
          Scoreboard
        </button>
        <button
          type="button"
          onClick={() => setView('eligible')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'eligible'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Still Eligible
        </button>
      </div>

      {/* Week navigator */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <Link
            href={`/admin/scoreboard?week=${prevWeek}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{weekLabel}</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentWeek ? 'This week (in progress)' : 'Completed week'}
            </p>
          </div>
          <Link
            href={`/admin/scoreboard?week=${nextWeek}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      {view === 'eligible' ? (
        <EligibleView eligible={eligible} total={rows.length} />
      ) : (
        <>
      {/* How the score works */}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Score</span> = the week&apos;s bonus
        multiplier (base + positives, with the normal strike rules applied), then −0.1 for each
        strike after the first. Higher is better; repeat strikes go negative.
      </p>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No active crew for this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <SortHead label="Name" k="name" />
                  <SortHead label="Role" k="role" />
                  <SortHead label="Positives" k="positives" className="text-right" />
                  <SortHead label="Strikes" k="strikes" className="text-right" />
                  <SortHead label="Score" k="score" className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const rank = rankById.get(r.employeeId)!;
                  return (
                    <TableRow key={r.employeeId}>
                      <TableCell>
                        {rank <= 3 ? (
                          <Badge
                            className={cn(
                              'font-bold',
                              rank === 1 && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                              rank === 2 && 'bg-slate-200 text-slate-700 hover:bg-slate-200',
                              rank === 3 && 'bg-orange-100 text-orange-800 hover:bg-orange-100'
                            )}
                          >
                            {rank}
                          </Badge>
                        ) : (
                          <span className="pl-2 text-muted-foreground">{rank}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.role}</TableCell>
                      <TableCell className="text-right">
                        {r.positives > 0 ? (
                          <span className="text-emerald-600">+{r.positives}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.strikes > 0 ? (
                          <span className="font-semibold text-red-600">{r.strikes}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', scoreClass(r.score))}>
                        {r.score > 0 ? '+' : ''}
                        {r.score.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}

function EligibleView({ eligible, total }: { eligible: ScoreRow[]; total: number }) {
  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex items-center gap-3 p-4">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="text-lg font-semibold text-foreground">
              {eligible.length} of {total} still eligible for the bonus
            </p>
            <p className="text-sm text-muted-foreground">
              A clean sheet — no strikes this week. One strike forfeits the bonus.
            </p>
          </div>
        </CardContent>
      </Card>

      {eligible.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No crew members are still eligible this week.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eligible.map((r) => (
            <Card key={r.employeeId} className="border-emerald-200">
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.role}
                    {r.positives > 0 && (
                      <span className="ml-1 text-emerald-600">· +{r.positives}</span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
