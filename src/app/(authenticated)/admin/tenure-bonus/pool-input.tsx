'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { setTenurePool } from './actions';

/** Enter the tenure pool (1% of revenue) for the payout period. */
export function PoolInput({ periodKey, poolAmount }: { periodKey: string; poolAmount: number }) {
  const router = useRouter();
  const [value, setValue] = useState(poolAmount ? String(poolAmount) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = Number(value.trim() || '0');
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      const res = await setTenurePool(periodKey, amount);
      if (!res.ok) toast.error(res.error || 'Save failed');
      else {
        toast.success('Pool saved');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Pool (1% of revenue) $</label>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-40"
            placeholder="0.00"
          />
        </div>
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save
      </Button>
    </div>
  );
}
