import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Employee, Attendance, PerfectWeek, MileageEntry, PerformanceEvent, ChecklistCompletion, Job } from '@/types';
import { DashboardContent } from './dashboard-content';

export default async function DashboardPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>(
    'SELECT * FROM employees WHERE email = $1',
    [email]
  );

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Employee profile not found. Please contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');

  const [attendance, perfectWeeks, mileage, performanceEvents, checklistCompletions, upcomingJobs] = await Promise.all([
    query<Attendance>('SELECT * FROM attendance WHERE employee_id = $1 AND date >= $2 AND date <= $3', [employee.id, monthStart, monthEnd]),
    query<PerfectWeek>('SELECT * FROM perfect_weeks WHERE employee_id = $1 AND achieved = true AND week_start >= $2 AND week_end <= $3', [employee.id, monthStart, monthEnd]),
    query<MileageEntry>('SELECT miles, amount FROM mileage_entries WHERE employee_id = $1 AND date >= $2 AND date <= $3', [employee.id, monthStart, monthEnd]),
    query<PerformanceEvent>('SELECT * FROM performance_events WHERE employee_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC LIMIT 5', [employee.id, monthStart, monthEnd]),
    query<ChecklistCompletion>('SELECT * FROM checklist_completions WHERE employee_id = $1 AND completed_at >= $2 AND completed_at <= $3', [employee.id, monthStart, monthEnd]),
    query<Job>('SELECT * FROM jobs WHERE $1 = ANY(crew_ids) AND date >= $2 ORDER BY date ASC, start_time ASC LIMIT 5', [employee.id, today]),
  ]);

  return (
    <DashboardContent
      employee={employee}
      attendance={attendance}
      perfectWeeks={perfectWeeks}
      mileage={mileage}
      performanceEvents={performanceEvents}
      checklistCompletions={checklistCompletions}
      upcomingJobs={upcomingJobs}
      today={today}
      monthLabel={format(now, 'MMMM yyyy')}
    />
  );
}
