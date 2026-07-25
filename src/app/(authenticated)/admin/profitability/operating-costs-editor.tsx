'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { CostLine } from '@/lib/profitability';
import { addOperatingCost, deleteOperatingCost } from '@/lib/profitability-actions';

const CATEGORIES = [
  { value: 'overhead', label: 'Overhead' },
  { value: 'debt', label: 'Debt service' },
  { value: 'salary', label: 'Owner / admin salary' },
  { value: 'other', label: 'Other' },
];
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function OperatingCostsEditor({
  year,
  month,
  costs,
}: {
  year: number;
  month: number;
  costs: CostLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState('overhead');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  function add() {
    if (!label.trim()) return toast.error('Add a label');
    startTransition(async () => {
      const res = await addOperatingCost({ year, month, category, label, amount });
      if (res.ok) {
        toast.success('Cost added');
        setLabel('');
        setAmount('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteOperatingCost(id);
      if (res.ok) {
        router.refresh();
      } else toast.error(res.error ?? 'Could not remove');
    });
  }

  const total = costs.reduce((s, c) => s + c.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operating costs — this month</CardTitle>
        <CardDescription>
          Overhead, debt service, and owner/admin salaries for the P&amp;L. Enter each as its own
          line; QuickBooks can fill these automatically once connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Warehouse rent" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </div>
          <Button onClick={add} disabled={pending}>
            Add cost
          </Button>
        </div>

        {costs.length > 0 ? (
          <ul className="divide-y">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground w-28 shrink-0">
                  {catLabel(c.category)}
                </span>
                <span className="flex-1 truncate">{c.label}</span>
                <span className="font-medium">{money(c.amount)}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(c.id)} disabled={pending}>
                  Remove
                </Button>
              </li>
            ))}
            <li className="flex items-center justify-between py-2 border-t-2 font-semibold">
              <span>Total operating costs</span>
              <span>{money(total)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No costs entered for this month yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
