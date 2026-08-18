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
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { PayrollDetailRow } from '@/lib/payroll-run';
import { saveOverride, saveMarketingHours, setClassification } from './actions';

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
}: {
  weekStart: string;
  detail: PayrollDetailRow[];
}) {
  const router = useRouter();

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
            <TableHead>Employee</TableHead>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">Billable</TableHead>
            <TableHead className="text-right">Warehouse</TableHead>
            <TableHead className="text-right">Marketing</TableHead>
            <TableHead className="text-right">Tips</TableHead>
            <TableHead className="text-right">Commissions</TableHead>
            <TableHead className="text-right">Bonus</TableHead>
            <TableHead className="text-right">Miles $</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Reg / OT</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Total Comp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.map((r) => (
            <TableRow key={r.employeeId}>
              <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
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
                        onClick={() => run(() => setClassification(r.employeeId, c))}
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
              <TableCell className="text-right text-muted-foreground">
                ${r.rate.toFixed(2)}
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
      <p className="text-xs text-muted-foreground mt-2">
        Edited cells (amber) override the computed value; the reset arrow reverts to computed. A
        re-import never clears your corrections. The ADP tables below reflect these values.
      </p>
    </div>
  );
}
