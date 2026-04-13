import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Employee, PayrollEntry } from '@/types';
import { PayrollContent } from './payroll-content';

export default async function MyPayrollPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>(
    'SELECT * FROM employees WHERE email = $1',
    [email]
  );

  if (!employee) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6"><p className="text-gray-500">Employee profile not found. Please contact your administrator.</p></CardContent></Card>
      </div>
    );
  }

  const entries = await query<PayrollEntry>(
    'SELECT * FROM payroll_entries WHERE employee_id = $1 ORDER BY week_start DESC LIMIT 26',
    [employee.id]
  );

  const today = new Date();
  const dayOfWeek = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentMonday.getDate() + 6);

  const thisWeekJobs = await query<{ estimated_hours: number | null; customer_name: string; job_number: string | null; date: string }>(
    'SELECT estimated_hours, customer_name, job_number, date FROM jobs WHERE $1 = ANY(crew_ids) AND date >= $2 AND date <= $3',
    [employee.id, format(currentMonday, 'yyyy-MM-dd'), format(currentSunday, 'yyyy-MM-dd')]
  );

  const expectedHours = thisWeekJobs.reduce((sum, j) => sum + (Number(j.estimated_hours) || 0), 0);
  const expectedPay = expectedHours * (Number(employee.hourly_rate) || 0);

  return (
    <PayrollContent
      employee={employee}
      entries={entries}
      thisWeekJobs={thisWeekJobs}
      expectedHours={expectedHours}
      expectedPay={expectedPay}
      currentMondayStr={format(currentMonday, 'MMM d')}
      currentSundayStr={format(currentSunday, 'MMM d')}
    />
  );
}
