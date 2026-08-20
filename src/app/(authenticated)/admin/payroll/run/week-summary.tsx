'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import type { WeekSummary } from '@/lib/payroll-run';
import { saveWeekSummary } from './actions';

function money(n: number | null): string {
  return n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

/** A colored ▲/▼ change indicator. `good` says which direction is favorable. */
function Delta({
  cur,
  prior,
  mode,
  good,
}: {
  cur: number | null;
  prior: number | null;
  mode: 'money' | 'count' | 'pctpts';
  good: 'up' | 'down' | 'neutral';
}) {
  if (cur == null || prior == null) return <span className="text-muted-foreground text-xs">no prior week</span>;
  const diff = cur - prior;
  const pctChange = prior !== 0 ? (diff / Math.abs(prior)) * 100 : null;
  const dir = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  const favorable = dir === 'flat' ? 'flat' : good === 'neutral' ? 'neutral' : dir === good ? 'good' : 'bad';
  const color =
    favorable === 'good'
      ? 'text-green-600 dark:text-green-500'
      : favorable === 'bad'
      ? 'text-destructive'
      : 'text-muted-foreground';
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
  const abs =
    mode === 'money' ? money(Math.abs(diff)) : mode === 'pctpts' ? `${Math.abs(diff).toFixed(1)} pts` : String(Math.abs(diff));
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {abs}
      {pctChange != null && mode !== 'pctpts' ? ` (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%)` : ''}
    </span>
  );
}

function Bars({ label, cur, prior }: { label: string; cur: number; prior: number }) {
  const max = Math.max(cur, prior, 1);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-14 text-xs">This</span>
          <div className="h-3 flex-1 rounded bg-muted overflow-hidden">
            <div className="h-full rounded bg-primary" style={{ width: `${(cur / max) * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-xs text-muted-foreground">Prior</span>
          <div className="h-3 flex-1 rounded bg-muted overflow-hidden">
            <div className="h-full rounded bg-muted-foreground/40" style={{ width: `${(prior / max) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeekSummaryPanel({ weekStart, summary }: { weekStart: string; summary: WeekSummary }) {
  const [jobs, setJobs] = useState(summary.jobs);
  const [revenue, setRevenue] = useState(summary.revenue);
  const [gross, setGross] = useState<number>(summary.payrollGross);

  async function save(field: 'jobs' | 'revenue' | 'gross', value: number | null) {
    const res = await saveWeekSummary(weekStart, field, value);
    if (!res.ok) toast.error(res.error || 'Save failed');
    else toast.success('Saved');
  }

  const laborRatio = revenue && revenue > 0 ? (gross / revenue) * 100 : null;
  const priorRatio = summary.prior.laborRatio != null ? summary.prior.laborRatio * 100 : null;

  const Field = ({
    value,
    onChange,
    onCommit,
    prefix,
    placeholder,
  }: {
    value: number | null;
    onChange: (v: number | null) => void;
    onCommit: () => void;
    prefix?: string;
    placeholder?: string;
  }) => (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-lg font-bold text-muted-foreground">{prefix}</span>}
      <Input
        type="number"
        step="0.01"
        value={value == null ? '' : String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        onBlur={onCommit}
        className="h-9 w-32 text-lg font-bold px-1 border-0 border-b rounded-none focus-visible:ring-0 focus-visible:border-primary"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Jobs */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Jobs</p>
          <Field value={jobs} onChange={setJobs} onCommit={() => save('jobs', jobs)} placeholder="0" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prior: {summary.prior.jobs ?? '—'}</span>
            <Delta cur={jobs} prior={summary.prior.jobs} mode="count" good="neutral" />
          </div>
        </div>

        {/* Revenue */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total revenue</p>
          <Field value={revenue} onChange={setRevenue} onCommit={() => save('revenue', revenue)} prefix="$" placeholder="0.00" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prior: {money(summary.prior.revenue)}</span>
            <Delta cur={revenue} prior={summary.prior.revenue} mode="money" good="up" />
          </div>
        </div>

        {/* Payroll gross */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Payroll gross</p>
          <Field
            value={gross}
            onChange={(v) => setGross(v ?? summary.computedGross)}
            onCommit={() => save('gross', gross === summary.computedGross ? null : gross)}
            prefix="$"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prior: {money(summary.prior.payrollGross)}</span>
            <Delta cur={gross} prior={summary.prior.payrollGross} mode="money" good="down" />
          </div>
          <p className="text-[11px] text-muted-foreground/70 pt-1">
            Preliminary · from run ({money(summary.computedGross)}) · excludes base salaries
          </p>
        </div>

        {/* Labor-cost ratio */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Labor-cost ratio</p>
          <p className="text-2xl font-bold">{pct(laborRatio)}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Prior: {pct(priorRatio)}</span>
            <Delta cur={laborRatio} prior={priorRatio} mode="pctpts" good="down" />
          </div>
          <p className="text-[11px] text-muted-foreground/70 pt-1">Payroll gross ÷ revenue</p>
        </div>
      </div>

      {/* This vs prior comparison bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 rounded-lg border p-4">
        <Bars label="Revenue" cur={revenue ?? 0} prior={summary.prior.revenue ?? 0} />
        <Bars label="Payroll gross" cur={gross} prior={summary.prior.payrollGross ?? 0} />
      </div>
    </div>
  );
}
