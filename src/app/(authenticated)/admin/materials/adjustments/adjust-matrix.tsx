'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adjustStockBatch, type AdjustCell } from '@/lib/materials/inventory-actions';
import type { AdjustColumn } from '@/lib/materials/inventory';

// key for a cell input value
const k = (col: AdjustColumn, materialId: number) => `${col.kind}:${col.id}:${materialId}`;

export function AdjustMatrix({
  columns,
  materials,
  current,
}: {
  columns: AdjustColumn[];
  materials: { id: number; name: string }[];
  current: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  // edited values keyed by cell; missing = unchanged (use current)
  const [edits, setEdits] = useState<Record<string, string>>({});

  const cur = (col: AdjustColumn, m: number) => current[k(col, m)] ?? 0;

  const changes: AdjustCell[] = useMemo(() => {
    const out: AdjustCell[] = [];
    for (const col of columns) {
      for (const m of materials) {
        const key = k(col, m.id);
        const raw = edits[key];
        if (raw === undefined || raw.trim() === '') continue;
        const next = Number(raw);
        if (!Number.isFinite(next)) continue;
        const delta = next - cur(col, m.id);
        if (delta !== 0) out.push({ materialId: m.id, location: col.kind, locationId: col.id, delta });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, columns, materials, current]);

  function save() {
    if (changes.length === 0) return toast.error('No changes to save');
    if (!reason.trim()) return toast.error('Add a reason (e.g. physical count)');
    startTransition(async () => {
      const res = await adjustStockBatch(changes, reason);
      if (res.ok) {
        toast.success(`Adjusted ${res.count} ${res.count === 1 ? 'cell' : 'cells'}`);
        setEdits({});
        setReason('');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save adjustments');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjust inventory</CardTitle>
        <CardDescription>
          Type the corrected on-hand into any cell — warehouse or truck. Changed cells are
          highlighted; save writes each as an adjustment with your reason. Blank = leave unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Material</TableHead>
                {columns.map((c) => (
                  <TableHead key={`${c.kind}-${c.id}`} className="text-right whitespace-nowrap">
                    {c.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium sticky left-0 bg-background whitespace-nowrap">
                    {m.name}
                  </TableCell>
                  {columns.map((c) => {
                    const key = k(c, m.id);
                    const currentVal = cur(c, m.id);
                    const raw = edits[key];
                    const changed =
                      raw !== undefined && raw.trim() !== '' && Number(raw) !== currentVal;
                    return (
                      <TableCell key={key} className="p-1">
                        <Input
                          type="number"
                          step="0.5"
                          value={raw ?? String(currentVal)}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className={`h-8 w-20 text-right tabular-nums ${
                            changed ? 'border-primary bg-primary/5 font-semibold' : ''
                          }`}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[16rem] space-y-1.5">
            <label className="text-sm font-medium">Reason (required)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count 7/27, damaged units, correction"
            />
          </div>
          <Button onClick={save} disabled={pending || changes.length === 0}>
            {pending ? 'Saving…' : `Save ${changes.length || ''} ${changes.length === 1 ? 'change' : 'changes'}`.trim()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
