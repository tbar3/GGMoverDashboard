import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Employee, Attendance, PerformanceEvent, PerfectWeek, MileageEntry, ChecklistCompletion } from '@/types';
import { StatsContent } from './stats-content';

export default async function StatsPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>(
    'SELECT * FROM employees WHERE email = $1',
    [email]
  );

  if (!employee) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6"><p className="text-gray-500">Employee profile not found.</p></CardContent></Card>
      </div>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const threeMonthsAgo = format(subMonths(now, 3), 'yyyy-MM-dd');

  const [attendance, checklistCompletions, performanceEvents, perfectWeeks, mileage] = await Promise.all([
    query<Attendance>('SELECT * FROM attendance WHERE employee_id = $1 AND date >= $2 ORDER BY date DESC', [employee.id, threeMonthsAgo]),
    query<ChecklistCompletion>('SELECT * FROM checklist_completions WHERE employee_id = $1 AND completed_at >= $2', [employee.id, monthStartStr]),
    query<PerformanceEvent>('SELECT * FROM performance_events WHERE employee_id = $1 ORDER BY date DESC LIMIT 10', [employee.id]),
    query<PerfectWeek>('SELECT * FROM perfect_weeks WHERE employee_id = $1 AND achieved = true ORDER BY week_start DESC', [employee.id]),
    query<MileageEntry>('SELECT miles, amount FROM mileage_entries WHERE employee_id = $1 AND date >= $2', [employee.id, monthStartStr]),
  ]);

  const currentMonthAttendance = attendance.filter(a => {
    const date = new Date(a.date);
    return date >= monthStart && date <= monthEnd;
  });

  const totalMiles = mileage.reduce((sum, m) => sum + Number(m.miles), 0);
  const totalMileageAmount = mileage.reduce((sum, m) => sum + Number(m.amount), 0);

  return (
    <StatsContent
      employee={employee}
      attendance={attendance}
      performanceEvents={performanceEvents}
      perfectWeeks={perfectWeeks}
      currentMonthAttendance={currentMonthAttendance}
      checklistsCompleted={checklistCompletions.length}
      totalMiles={totalMiles}
      totalMileageAmount={totalMileageAmount}
      monthLabel={format(now, 'MMMM yyyy')}
      monthStartStr={monthStartStr}
      monthEndStr={monthEndStr}
    />
  );
}
