'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { grantSkill, revokeSkill, setEmployeeBaseMultiplier } from '@/lib/skills-actions';

export function BonusMultiplierCard({
  employeeId,
  companyBase,
  baseOverride,
  driverAmount,
  leadAmount,
  driverSkillId,
  leadSkillId,
  isDriver: initialDriver,
  isLead: initialLead,
}: {
  employeeId: string;
  companyBase: number;
  baseOverride: number | null;
  driverAmount: number;
  leadAmount: number;
  driverSkillId: string | null;
  leadSkillId: string | null;
  isDriver: boolean;
  isLead: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseInput, setBaseInput] = useState(baseOverride != null ? String(baseOverride) : '');
  const [isDriver, setIsDriver] = useState(initialDriver);
  const [isLead, setIsLead] = useState(initialLead);

  const effectiveBase = baseInput.trim() !== '' && !isNaN(Number(baseInput)) ? Number(baseInput) : companyBase;
  const starting = effectiveBase + (isDriver ? driverAmount : 0) + (isLead ? leadAmount : 0);

  function saveBase() {
    startTransition(async () => {
      const res = await setEmployeeBaseMultiplier(employeeId, baseInput.trim() === '' ? null : baseInput);
      if (res.ok) {
        toast.success(baseInput.trim() === '' ? 'Reset to company default' : 'Base multiplier saved');
        router.refresh();
      } else toast.error(res.error ?? 'Could not save');
    });
  }

  function toggleRole(kind: 'driver' | 'lead', on: boolean) {
    const skillId = kind === 'driver' ? driverSkillId : leadSkillId;
    if (!skillId) {
      toast.error(`The ${kind === 'driver' ? 'Driver' : '2-Truck Lead'} skill isn't set up`);
      return;
    }
    // Optimistic; revert on failure.
    if (kind === 'driver') setIsDriver(on);
    else setIsLead(on);
    startTransition(async () => {
      const res = on ? await grantSkill(employeeId, skillId) : await revokeSkill(employeeId, skillId);
      if (res.ok) {
        toast.success(`${kind === 'driver' ? 'Driver' : '2-Truck Lead'} ${on ? 'added' : 'removed'}`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not update');
        if (kind === 'driver') setIsDriver(!on);
        else setIsLead(!on);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonus multiplier</CardTitle>
        <CardDescription>
          Their weekly starting multiplier: base + role add-ons. Positives earned during the week
          stack on top of this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live starting-multiplier readout */}
        <div className="rounded-lg bg-muted p-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold">{Math.round(starting * 100) / 100}×</span>
          <span className="text-sm text-muted-foreground">
            = base {Math.round(effectiveBase * 100) / 100}
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
            <Button
              variant="ghost"
              onClick={() => {
                setBaseInput('');
                startTransition(async () => {
                  await setEmployeeBaseMultiplier(employeeId, null);
                  toast.success('Reset to company default');
                  router.refresh();
                });
              }}
              disabled={pending}
            >
              Reset to default
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground/70">
          Leave blank to use the company default ({companyBase}).
        </p>

        {/* Role add-ons */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Role add-ons (+{driverAmount} each)</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDriver} onCheckedChange={(c) => toggleRole('driver', c as boolean)} disabled={pending} />
            Driver <span className="text-muted-foreground">(+{driverAmount}× and grants the Driver skill)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isLead} onCheckedChange={(c) => toggleRole('lead', c as boolean)} disabled={pending} />
            2-Truck Lead <span className="text-muted-foreground">(+{leadAmount}× and grants the 2-Truck Job Lead skill)</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
