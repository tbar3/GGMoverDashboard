import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { isBackOffice } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import {
  Employee,
  Attendance,
  MileageEntry,
  PerformanceEvent,
  Job,
} from '@/types';
import { getMessages, type Message } from '@/lib/messages';
import { getEmployeeSkills, effectiveRate, sumRaises } from '@/lib/skills';
import { getBaseRate } from '@/lib/settings';
import { getEmployeeWeek } from '@/lib/bonus';
import { DashboardContent, type WeekJob } from './dashboard-content';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>('SELECT * FROM employees WHERE email = $1', [email]);

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Employee profile not found. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Back office land on the Company Hub, not the crew dashboard.
  if (isBackOffice(employee)) redirect('/admin');

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');

  const [weekJobsRaw, responses, mileage, performanceEvents, attendance, messages, earnedSkills] =
    await Promise.all([
      query<Job>(
        `SELECT * FROM jobs WHERE $1 = ANY(crew_ids) AND date >= $2 AND date <= $3
         ORDER BY date ASC, start_time ASC`,
        [employee.id, weekStart, weekEnd]
      ),
      query<{ job_id: string; response: string; decline_reason: string | null }>(
        'SELECT job_id, response, decline_reason FROM job_responses WHERE employee_id = $1',
        [employee.id]
      ),
      query<MileageEntry>(
        'SELECT miles, amount FROM mileage_entries WHERE employee_id = $1 AND date >= $2 AND date <= $3',
        [employee.id, monthStart, monthEnd]
      ),
      query<PerformanceEvent>(
        'SELECT * FROM performance_events WHERE employee_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC LIMIT 5',
        [employee.id, monthStart, monthEnd]
      ),
      query<Attendance>(
        'SELECT * FROM attendance WHERE employee_id = $1 AND date >= $2 AND date <= $3',
        [employee.id, monthStart, monthEnd]
      ),
      getMessages(5),
      getEmployeeSkills(employee.id),
    ]);

  // Skill-driven pay: effective rate = override ?? base + earned skills.
  const baseRate = await getBaseRate();
  const earnedRaiseSum = sumRaises(earnedSkills);
  const hourlyRate = effectiveRate(employee.hourly_rate ?? null, earnedRaiseSum, baseRate);

  const bonusWeek = await getEmployeeWeek(employee.id, weekStart);

  // Newly-granted skills the employee hasn't acknowledged → celebration.
  const unacknowledged = earnedSkills.filter((s) => !s.acknowledged);
  const celebration =
    unacknowledged.length > 0
      ? {
          skills: unacknowledged.map((s) => ({ name: s.name, raise_amount: Number(s.raise_amount) })),
          newRate: hourlyRate,
        }
      : null;

  // Attach each job's response (for this employee) to the job.
  const responseByJob = new Map(responses.map((r) => [r.job_id, r]));
  const weekJobs: WeekJob[] = weekJobsRaw.map((j) => {
    const r = responseByJob.get(j.id);
    return {
      ...j,
      response: (r?.response as 'accepted' | 'declined' | undefined) ?? null,
      decline_reason: r?.decline_reason ?? null,
    };
  });

  return (
    <DashboardContent
      employee={employee}
      hourlyRate={hourlyRate}
      celebration={celebration}
      weekJobs={weekJobs}
      mileage={mileage}
      performanceEvents={performanceEvents}
      attendance={attendance}
      messages={messages as Message[]}
      today={today}
      bonusWeek={bonusWeek}
      weekLabel={`${format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM d')} – ${format(
        endOfWeek(now, { weekStartsOn: 1 }),
        'MMM d'
      )}`}
    />
  );
}
