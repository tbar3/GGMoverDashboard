import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { differenceInMonths, format, startOfMonth, endOfMonth } from 'date-fns';
import { CONFIG, Employee, Attendance, PerfectWeek, MileageEntry, PerformanceEvent, ChecklistCompletion } from '@/types';

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
            <p className="text-gray-500">Employee profile not found. Please contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const tenureMonths = differenceInMonths(now, new Date(employee.start_date));

  const [attendance, perfectWeeks, mileage, performanceEvents, checklistCompletions] = await Promise.all([
    query<Attendance>(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date >= $2 AND date <= $3',
      [employee.id, monthStart, monthEnd]
    ),
    query<PerfectWeek>(
      'SELECT * FROM perfect_weeks WHERE employee_id = $1 AND achieved = true AND week_start >= $2 AND week_end <= $3',
      [employee.id, monthStart, monthEnd]
    ),
    query<MileageEntry>(
      'SELECT miles, amount FROM mileage_entries WHERE employee_id = $1 AND date >= $2 AND date <= $3',
      [employee.id, monthStart, monthEnd]
    ),
    query<PerformanceEvent>(
      'SELECT * FROM performance_events WHERE employee_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC LIMIT 5',
      [employee.id, monthStart, monthEnd]
    ),
    query<ChecklistCompletion>(
      'SELECT * FROM checklist_completions WHERE employee_id = $1 AND completed_at >= $2 AND completed_at <= $3',
      [employee.id, monthStart, monthEnd]
    ),
  ]);

  const tardyCount = attendance.filter(a => a.is_tardy).length;
  const daysWorked = attendance.length;
  const perfectWeekCount = perfectWeeks.length;
  const totalMiles = mileage.reduce((sum, m) => sum + Number(m.miles), 0);
  const totalMileageAmount = mileage.reduce((sum, m) => sum + Number(m.amount), 0);
  const checklistsCompleted = checklistCompletions.length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {employee.name.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s your performance summary for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tenure</CardDescription>
            <CardTitle className="text-3xl">{tenureMonths}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {tenureMonths === 1 ? 'month' : 'months'} (= {tenureMonths} shares)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Perfect Weeks</CardDescription>
            <CardTitle className="text-3xl">{perfectWeekCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {perfectWeekCount} bonus {perfectWeekCount === 1 ? 'hour' : 'hours'} earned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tardies This Month</CardDescription>
            <CardTitle className="text-3xl">
              <span className={tardyCount === 0 ? 'text-green-600' : 'text-red-600'}>
                {tardyCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {daysWorked} days worked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mileage Earnings</CardDescription>
            <CardTitle className="text-3xl">
              ${totalMileageAmount.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {totalMiles} miles @ ${CONFIG.MILEAGE_RATE}/mi
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Recognition</CardTitle>
            <CardDescription>
              5-star reviews, customer call-outs, and crew recognition
            </CardDescription>
          </CardHeader>
          <CardContent>
            {performanceEvents.length > 0 ? (
              <div className="space-y-3">
                {performanceEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          event.type === 'five_star_review'
                            ? 'default'
                            : event.type === 'customer_callout'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {event.type === 'five_star_review'
                          ? '5-Star'
                          : event.type === 'customer_callout'
                          ? 'Customer'
                          : 'Crew'}
                      </Badge>
                      <span className="text-sm">
                        {event.description || 'Great work!'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(event.date), 'MMM d')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                No recognition events this month yet. Keep up the great work!
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Month at a Glance</CardTitle>
            <CardDescription>Your performance metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Role</span>
              <Badge variant="outline" className="capitalize">
                {employee.role}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Checklists Completed</span>
              <span className="font-medium">{checklistsCompleted}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Attendance Rate</span>
              <span className="font-medium">
                {daysWorked > 0
                  ? `${Math.round(((daysWorked - tardyCount) / daysWorked) * 100)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Performance Events</span>
              <span className="font-medium">{performanceEvents.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Start Date</span>
              <span className="font-medium">
                {format(new Date(employee.start_date), 'MMM d, yyyy')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
