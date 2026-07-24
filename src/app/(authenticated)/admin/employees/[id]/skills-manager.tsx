'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Skill } from '@/lib/skills';
import { grantSkill, revokeSkill } from '@/lib/skills-actions';

interface SkillsManagerProps {
  employeeId: string;
  skills: Skill[];
  earnedSkillIds: string[];
  derivedRate: number;
  hasOverride: boolean;
}

export function SkillsManager({
  employeeId,
  skills,
  earnedSkillIds,
  derivedRate,
  hasOverride,
}: SkillsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const earned = new Set(earnedSkillIds);

  function toggle(skill: Skill, has: boolean) {
    startTransition(async () => {
      const res = has
        ? await revokeSkill(employeeId, skill.id)
        : await grantSkill(employeeId, skill.id);
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong');
        return;
      }
      toast.success(has ? `Removed ${skill.name}` : `Granted ${skill.name} (+$${Number(skill.raise_amount).toFixed(0)}/hr)`);
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Skills &amp; Pay Scale</CardTitle>
        <CardDescription>
          Each skill adds to the rate. Skill-based rate:{' '}
          <span className="font-semibold text-foreground">${derivedRate.toFixed(2)}/hr</span>
          {hasOverride && ' (a manual override is set above, so it wins)'}. Granting a skill shows
          the employee a celebration on their dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {skills.map((s) => {
            const has = earned.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => toggle(s, has)}
                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60 ${
                  has
                    ? 'border-green-500 bg-green-50 hover:bg-green-100'
                    : 'border-input bg-background hover:bg-muted'
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    has ? 'bg-green-500 text-white' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {has ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    +${Number(s.raise_amount).toFixed(0)}/hr
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
