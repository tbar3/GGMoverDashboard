import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { differenceInMonths, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';
import { CONFIG } from '@/types';
import { CalendarCheck, Clock, TrendingUp, Award } from 'lucide-react';

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get employee
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
            <p className="text-gray-500">Employee profile not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const tenureMonths = differenceInMonths(now, new Date(employee.start_date));

  // Get attendance history (last 3 months)
  const threeMonthsAgo = subMonths(now, 3);
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('date', format(threeMonthsAgo, 'yyyy-MM-dd'))
    .order('date', { ascending: false });

  // Current month stats
  const currentMonthAttendance = attendance?.filter(a => {
    const date = new Date(a.date);
    return date >= monthStart && date <= monthEnd;
  }) || [];

  const tardyCount = currentMonthAttendance.filter(a => a.is_tardy).length;
  const uniformCount = currentMonthAttendance.filter(a => !a.in_uniform).length;
  const daysWorked = currentMonthAttendance.length;
  const onTimePercentage = daysWorked > 0
    ? Math.round(((daysWorked - tardyCount) / daysWorked) * 100)
    : 100;

  // Get checklist completions
  const { data: checklistCompletions } = await supabase
    .from('checklist_completions')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('completed_at', format(monthStart, 'yyyy-MM-dd'));

  const checklistsCompleted = checklistCompletions?.length || 0;

  // Get performance events
  const { data: performanceEvents } = await supabase
    .from('performance_events')
    .select('*')
    .eq('employee_id', employee.id)
    .order('date', { ascending: false })
    .limit(10);

  // Get perfect weeks
  const { data: perfectWeeks } = await supabase
    .from('perfect_weeks')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('achieved', true)
    .order('week_start', { ascending: false });

  // Get mileage
  const { data: mileage } = await supabase
    .from('mileage_entries')
    .select('miles, amount')
    .eq('employee_id', employee.id)
    .gte('date', format(monthStart, 'yyyy-MM-dd'));

  const totalMiles = mileage?.reduce((sum, m) => sum + m.miles, 0) || 0;
  const totalMileageAmount = mileage?.reduce((sum, m) => sum + m.amount, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Stats</h1>
        <p className="text-gray-500 mt-1">
          Your performance metrics and history
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Tenure
            </CardDescription>
            <CardTitle className="text-3xl">{tenureMonths}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {tenureMonths === 1 ? 'month' : 'months'} = {tenureMonths} shares
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              On-Time Rate
            </CardDescription>
            <CardTitle className={`text-3xl ${onTimePercentage >= 90 ? 'text-green-600' : onTimePercentage >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
              {onTimePercentage}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {daysWorked - tardyCount}/{daysWorked} days this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Perfect Weeks
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {perfectWeeks?.filter(pw => {
                const weekStart = new Date(pw.week_start);
                return weekStart >= monthStart && weekStart <= monthEnd;
              }).length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              this month ({perfectWeeks?.length || 0} total)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance Score
            </CardDescription>
            <CardTitle className="text-3xl">
              {performanceEvents?.filter(pe => {
                const date = new Date(pe.date);
                return date >= monthStart && date <= monthEnd;
              }).length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              recognition events this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance</CardTitle>
            <CardDescription>Your last 10 work days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uniform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance && attendance.length > 0 ? (
                  attendance.slice(0, 10).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {format(new Date(record.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {record.arrival_time || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.is_tardy ? 'destructive' : 'default'}>
                          {record.is_tardy ? 'Tardy' : 'On Time'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.in_uniform ? 'default' : 'destructive'}>
                          {record.in_uniform ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No attendance records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recognition History */}
        <Card>
          <CardHeader>
            <CardTitle>Recognition History</CardTitle>
            <CardDescription>Your performance events</CardDescription>
          </CardHeader>
          <CardContent>
            {performanceEvents && performanceEvents.length > 0 ? (
              <div className="space-y-3">
                {performanceEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
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
              <p className="text-gray-500 text-sm text-center py-8">
                No recognition events yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mileage Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Mileage This Month</CardTitle>
            <CardDescription>Personal vehicle compensation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="text-2xl font-bold text-blue-600">
                  ${totalMileageAmount.toFixed(2)}
                </p>
                <p className="text-sm text-blue-500">
                  {totalMiles.toFixed(1)} miles @ ${CONFIG.MILEAGE_RATE}/mi
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="bg-white">
                  {format(now, 'MMMM yyyy')}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Summary</CardTitle>
            <CardDescription>Your employment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Role</span>
              <Badge variant="outline" className="capitalize">
                {employee.role}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Start Date</span>
              <span className="font-medium">
                {format(new Date(employee.start_date), 'MMM d, yyyy')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Tenure Shares</span>
              <span className="font-medium">{tenureMonths}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Checklists Completed</span>
              <span className="font-medium">{checklistsCompleted} this month</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Uniform Violations</span>
              <span className={`font-medium ${uniformCount === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {uniformCount} this month
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
