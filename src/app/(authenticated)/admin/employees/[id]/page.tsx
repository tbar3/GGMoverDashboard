import { queryOne } from '@/lib/db';
import { Employee } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSkills, getEmployeeSkills, sumRaises } from '@/lib/skills';
import { getBaseRate } from '@/lib/settings';
import { getEmployeeEvents } from '@/lib/bonus';
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

  const [skills, earned, baseRate, events, writeUpsThisMonth, evaluation] = await Promise.all([
    getSkills(),
    getEmployeeSkills(id),
    getBaseRate(),
    getEmployeeEvents(id, 200),
    getWriteUpMonthCount(id),
    getEvaluationForEmployee(id),
  ]);
  const derivedRate = baseRate + sumRaises(earned);
  const isCrew = !isBackOfficeRole(employee.role) && !employee.is_admin;
  const flaggedForTermination = employee.is_active && writeUpsThisMonth >= 3;
  const evalDueDate = employee.start_date
    ? format(addDays(new Date(`${employee.start_date}T12:00:00`), EVAL_WINDOW_DAYS), 'yyyy-MM-dd')
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
      <SkillsManager
        employeeId={employee.id}
        skills={skills}
        earnedSkillIds={earned.map((e) => e.skill_id)}
        derivedRate={derivedRate}
        hasOverride={employee.hourly_rate != null}
      />
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
