'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Minus } from 'lucide-react';
import { setEmployeeBaseMultiplier } from '@/lib/skills-actions';

export function BonusMultiplierCard({
  employeeId,
  companyBase,
  baseOverride,
  driverAmount,
  leadAmount,
  isDriver,
  isLead,
}: {
  employeeId: string;
  companyBase: number;
  baseOverride: number | null;
  driverAmount: number;
  leadAmount: number;
  isDriver: boolean;
  isLead: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseInput, setBaseInput] = useState(baseOverride != null ? String(baseOverride) : '');

  const effectiveBase =
    baseInput.trim() !== '' && !isNaN(Number(baseInput)) ? Number(baseInput) : companyBase;
  const starting = effectiveBase + (isDriver ? driverAmount : 0) + (isLead ? leadAmount : 0);
  const round = (n: number) => Math.round(n * 100) / 100;

  function saveBase() {
    startTransition(async () => {
      const res = await setEmployeeBaseMultiplier(employeeId, baseInput.trim() === '' ? null : baseInput);
      if (res.ok) {
        toast.success(baseInput.trim() === '' ? 'Reset to company default' : 'Base multiplier saved');
        router.refresh();
      } else toast.error(res.error ?? 'Could not save');
    });
  }

  function resetBase() {
    setBaseInput('');
    startTransition(async () => {
      const res = await setEmployeeBaseMultiplier(employeeId, null);
      if (res.ok) {
        toast.success('Reset to company default');
        router.refresh();
      } else toast.error(res.error ?? 'Could not reset');
    });
  }

  const RoleRow = ({ on, label, amount }: { on: boolean; label: string; amount: number }) => (
    <div className="flex items-center gap-2 text-sm">
      {on ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={on ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={on ? 'font-medium' : 'text-muted-foreground'}>+{amount}×</span>
      {!on && <span className="text-xs text-muted-foreground/70">(skill not earned)</span>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonus multiplier</CardTitle>
        <CardDescription>
          Their weekly starting multiplier: base + role add-ons. Driver and 2-Truck Lead come straight
          from the skills below — check them in Skills &amp; Pay Scale and they apply here automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live starting-multiplier readout */}
        <div className="rounded-lg bg-muted p-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold">{round(starting)}×</span>
          <span className="text-sm text-muted-foreground">
            = base {round(effectiveBase)}
            {isDriver ? ` + Driver ${driverAmount}` : ''}
            {isLead ? ` + 2-Truck Lead ${leadAmount}` : ''}
          </span>
        </div>

        {/* Base multiplier edit */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Base multiplier</Label>
            <Input
              type="number"
              step="0.05"
              min="0"
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder={`${companyBase} (company default)`}
              className="w-56"
            />
          </div>
          <Button onClick={saveBase} disabled={pending}>
            Save base
          </Button>
          {baseOverride != null && (
            <Button variant="ghost" onClick={resetBase} disabled={pending}>
              Reset to default
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground/70">
          Leave blank to use the company default ({companyBase}).
        </p>

        {/* Role add-ons — reflected from skills, not editable here */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Role add-ons (from skills)</p>
          <RoleRow on={isDriver} label="Driver" amount={driverAmount} />
          <RoleRow on={isLead} label="2-Truck Lead" amount={leadAmount} />
          <p className="text-xs text-muted-foreground/70">
            Toggle these in Skills &amp; Pay Scale below — they drive both pay and this multiplier.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
