'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Minus, CheckCircle2 } from 'lucide-react';
import { logPractice, undoPractice } from '@/lib/certification-actions';
import { grantSkill } from '@/lib/skills-actions';
import type { RequirementProgress } from '@/lib/certifications';

export function PracticeControls({
  employeeId,
  skillId,
  requirements,
}: {
  employeeId: string;
  skillId: string;
  requirements: RequirementProgress[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function log(requirementId: string) {
    start(async () => {
      const res = await logPractice({ employeeId, skillId, requirementId });
      if (res.ok) router.refresh();
      else toast.error(res.error ?? 'Could not log');
    });
  }
  function undo(requirementId: string) {
    start(async () => {
      const res = await undoPractice({ employeeId, requirementId });
      if (res.ok) router.refresh();
      else toast.error(res.error ?? 'Could not undo');
    });
  }

  if (requirements.length === 0) {
    return <p className="text-sm text-muted-foreground">No requirements defined for this skill yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {requirements.map((r) => (
        <li key={r.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 font-medium">{r.label}</span>
            <span className="text-sm text-muted-foreground">
              {r.logged} / {r.target_count}
            </span>
            {r.met && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Met</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${r.met ? 'bg-green-500' : 'bg-primary'}`}
                style={{ width: `${r.pct}%` }}
              />
            </div>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => undo(r.id)} disabled={pending || r.logged === 0}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => log(r.id)} disabled={pending}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GrantButton({
  employeeId,
  skillId,
  skillName,
  candidateName,
}: {
  employeeId: string;
  skillId: string;
  skillName: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function grant() {
    if (!window.confirm(`Certify ${candidateName} in "${skillName}"? This grants the skill and raises their pay.`)) return;
    start(async () => {
      const res = await grantSkill(employeeId, skillId);
      if (res.ok) {
        toast.success(`${candidateName} certified in ${skillName}`);
        router.push(`/admin/certifications?skill=${skillId}`);
        router.refresh();
      } else toast.error(res.error ?? 'Could not certify');
    });
  }

  return (
    <Button onClick={grant} disabled={pending}>
      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Certify {candidateName}
    </Button>
  );
}
