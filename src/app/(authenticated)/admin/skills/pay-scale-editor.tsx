'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import type { Skill } from '@/lib/skills';
import { createSkill, updateSkill, deleteSkill, setBaseRate } from '@/lib/skills-actions';

export function PayScaleEditor({ skills, baseRate }: { skills: Skill[]; baseRate: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Base rate
  const [base, setBase] = useState(baseRate.toFixed(2));

  // New skill
  const [newName, setNewName] = useState('');
  const [newRaise, setNewRaise] = useState('1.00');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong');
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Base rate */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Base Rate</CardTitle>
          <CardDescription>
            Everyone starts here; each earned skill adds its raise on top.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="base">Base ($/hr)</Label>
              <Input
                id="base"
                inputMode="decimal"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="w-32"
              />
            </div>
            <Button disabled={pending} onClick={() => run(() => setBaseRate(base), 'Base rate saved')}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills list */}
      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            Edit a skill&apos;s name or raise, turn it off to hide it from the catalog, or delete it.
            Deleting removes it from everyone who earned it — turn it Off instead to keep history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} pending={pending} onRun={run} />
          ))}

          {/* Add new */}
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label htmlFor="new-name" className="text-xs">
                New skill
              </Label>
              <Input
                id="new-name"
                placeholder="Skill name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-56"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-raise" className="text-xs">
                Raise ($/hr)
              </Label>
              <Input
                id="new-raise"
                inputMode="decimal"
                value={newRaise}
                onChange={(e) => setNewRaise(e.target.value)}
                className="w-28"
              />
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await createSkill(newName, newRaise);
                  if (res.ok) {
                    setNewName('');
                    setNewRaise('1.00');
                  }
                  return res;
                }, 'Skill added')
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillRow({
  skill,
  pending,
  onRun,
}: {
  skill: Skill;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => void;
}) {
  const [name, setName] = useState(skill.name);
  const [raise, setRaise] = useState(Number(skill.raise_amount).toFixed(2));
  const [active, setActive] = useState(skill.active);
  const dirty =
    name !== skill.name ||
    raise !== Number(skill.raise_amount).toFixed(2) ||
    active !== skill.active;

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${active ? '' : 'opacity-60'}`}>
      <Input value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">+$</span>
        <Input
          inputMode="decimal"
          value={raise}
          onChange={(e) => setRaise(e.target.value)}
          className="w-20"
        />
        <span className="text-sm text-muted-foreground">/hr</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Active
      </label>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => onRun(() => updateSkill(skill.id, name, raise, active), 'Skill saved')}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label="Delete skill"
          onClick={() => onRun(() => deleteSkill(skill.id), 'Skill deleted')}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
