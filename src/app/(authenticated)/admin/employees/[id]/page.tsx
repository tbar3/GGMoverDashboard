import { queryOne } from '@/lib/db';
import { Employee } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSkills, getEmployeeSkills, sumRaises } from '@/lib/skills';
import { getBaseRate } from '@/lib/settings';
import { getEmployeeEvents, getEstimatedWeekBonus, weekStartOf, getBonusConfig } from '@/lib/bonus';
import { Card, CardContent } from '@/components/ui/card';
import { BonusMultiplierCard } from './bonus-multiplier-card';
import { getWriteUpMonthCount } from '@/lib/admin-metrics';
import { getEvaluationForEmployee, EVAL_WINDOW_DAYS } from '@/lib/new-crew-eval';
import { isBackOfficeRole } from '@/lib/roles';
import { EditEmployeeForm } from './edit-form';
import { SkillsManager } from './skills-manager';
import { TerminationCard } from './termination-card';
import { NewCrewEvalCard } from './new-crew-eval-card';
import { EventsTable } from '@/components/crew/events-table';
import { addDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await queryOne<Employee>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!employee) notFound();

  const [skills, earned, baseRate, events, writeUpsThisMonth, evaluation, estBonus, bonusConfig] = await Promise.all([
    getSkills(),
    getEmployeeSkills(id),
    getBaseRate(),
    getEmployeeEvents(id, 200),
    getWriteUpMonthCount(id),
    getEvaluationForEmployee(id),
    getEstimatedWeekBonus(id, weekStartOf(new Date())),
    getBonusConfig(),
  ]);
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const derivedRate = baseRate + sumRaises(earned);
  const earnedIds = new Set(earned.map((e) => e.skill_id));
  const driverSkill = skills.find((s) => s.name === 'Driver') ?? null;
  const leadSkill = skills.find((s) => s.name === '2-Truck Job Lead') ?? null;
  const isCrew = !isBackOfficeRole(employee.role) && !employee.is_admin;
  const flaggedForTermination = employee.is_active && writeUpsThisMonth >= 3;
  // pg returns DATE columns as Date objects; parse defensively so a missing or odd
  // start_date can never crash the page.
  const startDate = employee.start_date ? new Date(employee.start_date) : null;
  const evalDueDate =
    startDate && !isNaN(startDate.getTime())
      ? format(addDays(startDate, EVAL_WINDOW_DAYS), 'yyyy-MM-dd')
      : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/employees">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Employee</h1>
          <p className="text-muted-foreground mt-1">{employee.name}</p>
        </div>
      </div>
      {flaggedForTermination && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            <span className="font-semibold">Flagged for termination review</span> — {writeUpsThisMonth}{' '}
            write-ups this month (policy triggers review at 3).
          </p>
        </div>
      )}
      <EditEmployeeForm employee={employee} />
      {isCrew && (
        <NewCrewEvalCard
          employeeId={employee.id}
          dueDate={evalDueDate}
          existing={evaluation}
        />
      )}
      <BonusMultiplierCard
        employeeId={employee.id}
        companyBase={bonusConfig.baseMultiplier}
        baseOverride={employee.base_multiplier != null ? Number(employee.base_multiplier) : null}
        driverAmount={bonusConfig.driverWeekly}
        leadAmount={bonusConfig.truckLeadWeekly}
        driverSkillId={driverSkill?.id ?? null}
        leadSkillId={leadSkill?.id ?? null}
        isDriver={driverSkill ? earnedIds.has(driverSkill.id) : false}
        isLead={leadSkill ? earnedIds.has(leadSkill.id) : false}
      />
      <SkillsManager
        employeeId={employee.id}
        skills={skills}
        earnedSkillIds={earned.map((e) => e.skill_id)}
        derivedRate={derivedRate}
        hasOverride={employee.hourly_rate != null}
      />
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium text-muted-foreground">Estimated bonus — this week</p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-bold">
                {estBonus.hasStrike && estBonus.multiplier === 0 ? 'Forfeit' : `${estBonus.multiplier}×`}
              </p>
              <p className="text-xs text-muted-foreground">Multiplier</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-2xl font-bold">{estBonus.estHours.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Est. hours (from jobs)</p>
            </div>
            <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 p-3">
              <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{money(estBonus.estBonus)}</p>
              <p className="text-xs text-muted-foreground">Projected bonus</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Projection from this week&apos;s assigned jobs&apos; estimated hours × multiplier. Final pay uses
            imported payroll hours.
          </p>
        </CardContent>
      </Card>
      <EventsTable
        events={events}
        title="Performance & bonus events"
        description="Positives, GG Points, strikes, and write-ups on this employee's record."
        empty="No events logged for this employee yet."
      />
      <TerminationCard employee={employee} />
    </div>
  );
}
