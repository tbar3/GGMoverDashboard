import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { differenceInMonths, format, startOfMonth, endOfMonth } from 'date-fns';
import { CONFIG } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get employee info
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('email', user?.email)
    .single();

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
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const tenureMonths = differenceInMonths(now, new Date(employee.start_date));

  // Get attendance for current month
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const tardyCount = attendance?.filter(a => a.is_tardy).length || 0;
  const daysWorked = attendance?.length || 0;

  // Get perfect weeks for current month
  const { data: perfectWeeks } = await supabase
    .from('perfect_weeks')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('achieved', true)
    .gte('week_start', format(monthStart, 'yyyy-MM-dd'))
    .lte('week_end', format(monthEnd, 'yyyy-MM-dd'));

  const perfectWeekCount = perfectWeeks?.length || 0;

  // Get mileage for current month
  const { data: mileage } = await supabase
    .from('mileage_entries')
    .select('miles, amount')
    .eq('employee_id', employee.id)
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const totalMiles = mileage?.reduce((sum, m) => sum + m.miles, 0) || 0;
  const totalMileageAmount = mileage?.reduce((sum, m) => sum + m.amount, 0) || 0;

  // Get performance events for current month
  const { data: performanceEvents } = await supabase
    .from('performance_events')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'))
    .order('date', { ascending: false })
    .limit(5);

  // Get checklist completions for current month
  const { data: checklistCompletions } = await supabase
    .from('checklist_completions')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('completed_at', format(monthStart, 'yyyy-MM-dd'))
    .lte('completed_at', format(monthEnd, 'yyyy-MM-dd'));

  const checklistsCompleted = checklistCompletions?.length || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {employee.name.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s your performance summary for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tenure */}
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

        {/* Perfect Weeks */}
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

        {/* Tardies */}
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

        {/* Mileage */}
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

      {/* Details Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Recognition</CardTitle>
            <CardDescription>
              5-star reviews, customer call-outs, and crew recognition
            </CardDescription>
          </CardHeader>
          <CardContent>
            {performanceEvents && performanceEvents.length > 0 ? (
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

        {/* Quick Stats */}
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
              <span className="font-medium">{performanceEvents?.length || 0}</span>
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
