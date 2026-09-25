'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw, ArrowUp, ArrowDown, ChevronsUpDown, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PayrollDetailRow } from '@/lib/payroll-run';
import {
  saveOverride,
  saveMarketingHours,
  setClassification,
  addMarketingRow,
  saveMarketingRate,
  removeMarketingRow,
} from './actions';

/** Someone who can be added to the run by hand (active crew not already on it). */
export interface AddableEmployee {
  id: string;
  name: string;
  hourlyRate: number | null;
}

type SortKey =
  | 'name'
  | 'classification'
  | 'billableHours'
  | 'warehouseHours'
  | 'marketingHours'
  | 'tips'
  | 'commissions'
  | 'bonus'
  | 'miles'
  | 'totalHours'
  | 'overtimeHours'
  | 'rate'
  | 'totalCompensation';

/** A number cell that saves on blur; an amber ring marks an active override. */
function EditableNumber({
  value,
  overridden,
  onSave,
  onReset,
  prefix,
}: {
  value: number;
  overridden?: boolean;
  onSave: (v: number | null) => Promise<void>;
  onReset?: () => Promise<void>;
  prefix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [busy, setBusy] = useState(false);

  async function commit() {
    const trimmed = text.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed != null && !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    if (parsed === value && !overridden) return; // no change
    setBusy(true);
    try {
      await onSave(parsed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
      <Input
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={`h-8 w-20 text-right ${overridden ? 'ring-1 ring-amber-500' : ''}`}
      />
      {overridden && onReset && (
        <button
          type="button"
          title="Reset to computed"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CorrectionsTable({
  weekStart,
  detail,
  addable = [],
}: {
  weekStart: string;
  detail: PayrollDetailRow[];
  addable?: AddableEmployee[];
}) {
  const router = useRouter();
  const [addId, setAddId] = useState('');
  const [addHours, setAddHours] = useState('');
  const [addRate, setAddRate] = useState('');
  const [adding, setAdding] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...detail].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortHead = (label: string, col: SortKey, align: 'left' | 'right' = 'right') => (
    <TableHead key={col} className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground select-none ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        {label}
        {sortKey === col ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) toast.error(res.error || 'Save failed');
    else {
      toast.success('Saved');
      router.refresh();
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {sortHead('Employee', 'name', 'left')}
            {sortHead('Class', 'classification', 'left')}
            {sortHead('Billable', 'billableHours')}
            {sortHead('Warehouse', 'warehouseHours')}
            {sortHead('Marketing', 'marketingHours')}
            {sortHead('Tips', 'tips')}
            {sortHead('Commissions', 'commissions')}
            {sortHead('Bonus', 'bonus')}
            {sortHead('Miles $', 'miles')}
            {sortHead('Total', 'totalHours')}
            {sortHead('Reg / OT', 'overtimeHours')}
            {sortHead('Rate', 'rate')}
            {sortHead('Total Comp', 'totalCompensation')}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.employeeId}>
              <TableCell className="font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  {r.name}
                  {r.marketingOnly && (
                    <>
                      <span
                        title="Added manually — not in the imported payroll report"
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground"
                      >
                        manual
                      </span>
                      <button
                        type="button"
                        title="Remove this row from the run"
                        onClick={() => run(() => removeMarketingRow(r.employeeId, weekStart))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </span>
              </TableCell>
              <TableCell>
                {r.classification ? (
                  <span className="text-xs text-muted-foreground">{r.classification}</span>
                ) : (
                  <div className="flex gap-1">
                    {(['W-2', '1099'] as const).map((c) => (
                      <Button
                        key={c}
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => run(() => setClassification(r.employeeId, c, weekStart))}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {r.billableHours.toFixed(2)}
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.warehouseHours}
                  overridden={r.ov.warehouse != null}
                  onSave={(v) => run(() => saveOverride(r.employeeId, weekStart, 'warehouse', v))}
                  onReset={() => run(() => saveOverride(r.employeeId, weekStart, 'warehouse', null))}
                />
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.marketingHours}
                  onSave={(v) => run(() => saveMarketingHours(r.employeeId, weekStart, v ?? 0))}
                />
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.tips}
                  overridden={r.ov.tips != null}
                  prefix="$"
                  onSave={(v) => run(() => saveOverride(r.employeeId, weekStart, 'tips', v))}
                  onReset={() => run(() => saveOverride(r.employeeId, weekStart, 'tips', null))}
                />
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.commissions}
                  overridden={r.ov.commissions != null}
                  prefix="$"
                  onSave={(v) => run(() => saveOverride(r.employeeId, weekStart, 'commissions', v))}
                  onReset={() => run(() => saveOverride(r.employeeId, weekStart, 'commissions', null))}
                />
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.bonus}
                  overridden={r.ov.bonus != null}
                  prefix="$"
                  onSave={(v) => run(() => saveOverride(r.employeeId, weekStart, 'bonus', v))}
                  onReset={() => run(() => saveOverride(r.employeeId, weekStart, 'bonus', null))}
                />
              </TableCell>
              <TableCell>
                <EditableNumber
                  value={r.miles}
                  overridden={r.ov.miles != null}
                  prefix="$"
                  onSave={(v) => run(() => saveOverride(r.employeeId, weekStart, 'miles', v))}
                  onReset={() => run(() => saveOverride(r.employeeId, weekStart, 'miles', null))}
                />
              </TableCell>
              <TableCell className="text-right font-medium">{r.totalHours.toFixed(2)}</TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                {r.regularHours.toFixed(2)} / {r.overtimeHours.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                {r.annualSalary != null ? (
                  // Salaried staff have no hourly rate — show the weekly salary that
                  // is actually being paid instead of a meaningless $0.00.
                  <span title={`$${r.annualSalary.toLocaleString('en-US')}/yr salaried`}>
                    ${r.weeklySalary.toFixed(2)}
                    <span className="text-xs"> /wk</span>
                  </span>
                ) : r.marketingOnly ? (
                  // No imported row means no rate arrived with the report, so this is
                  // the only place it can be set or corrected.
                  <EditableNumber
                    value={r.rate}
                    prefix="$"
                    onSave={(v) => run(() => saveMarketingRate(r.employeeId, weekStart, v))}
                  />
                ) : (
                  `$${r.rate.toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="text-right font-semibold">
                ${r.totalCompensation.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
          {detail.length > 0 && (
            <TableRow className="font-semibold border-t-2">
              <TableCell colSpan={12} className="text-right">
                Total compensation this period
              </TableCell>
              <TableCell className="text-right">
                ${detail.reduce((s, r) => s + r.totalCompensation, 0).toFixed(2)}
              </TableCell>
            </TableRow>
          )}
          {detail.length === 0 && (
            <TableRow>
              <TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                No employees imported for this week.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {addable.length > 0 && (
        <div className="mt-4 rounded-md border border-dashed p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Add someone not on the report</label>
              <select
                value={addId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAddId(id);
                  // Prefill the rate from their employee record when it has one, so the
                  // common case is one field instead of two.
                  const emp = addable.find((a) => a.id === id);
                  setAddRate(emp?.hourlyRate != null ? String(emp.hourlyRate) : '');
                }}
                className="h-8 w-56 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Select a person…</option>
                {addable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Marketing hours</label>
              <Input
                value={addHours}
                onChange={(e) => setAddHours(e.target.value)}
                placeholder="0.00"
                className="h-8 w-24 text-right"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rate $/hr</label>
              <Input
                value={addRate}
                onChange={(e) => setAddRate(e.target.value)}
                placeholder="0.00"
                className="h-8 w-24 text-right"
              />
            </div>
            <Button
              size="sm"
              disabled={adding || !addId}
              onClick={async () => {
                const hours = Number(addHours);
                if (!Number.isFinite(hours) || hours <= 0) {
                  toast.error('Enter the marketing hours worked');
                  return;
                }
                const rateText = addRate.trim();
                const rate = rateText === '' ? null : Number(rateText);
                if (rate != null && !Number.isFinite(rate)) {
                  toast.error('Rate must be a number');
                  return;
                }
                setAdding(true);
                try {
                  const res = await addMarketingRow(addId, weekStart, hours, rate);
                  if (!res.ok) toast.error(res.error || 'Could not add the row');
                  else {
                    toast.success('Added to the run');
                    setAddId('');
                    setAddHours('');
                    setAddRate('');
                    router.refresh();
                  }
                } finally {
                  setAdding(false);
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            For someone who did marketing but never went out on a move, so they are not in the
            SmartMoving report. Tips, commissions, bonus and mileage can be set on their row once
            it appears. Leave the rate blank to use their employee record.
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Edited cells (amber) override the computed value; the reset arrow reverts to computed. A
        re-import never clears your corrections. The ADP tables below reflect these values.
      </p>
    </div>
  );
}
