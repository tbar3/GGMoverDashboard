import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, AlertTriangle, Star, Car, CalendarCheck } from 'lucide-react';

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Get counts
  const { count: employeeCount } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: jobCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const { data: damages } = await supabase
    .from('damages')
    .select('amount, was_reported')
    .gte('created_at', format(monthStart, 'yyyy-MM-dd'))
    .lte('created_at', format(monthEnd, 'yyyy-MM-dd'));

  const totalDamages = damages?.reduce((sum, d) => {
    return sum + (d.was_reported ? d.amount : d.amount * 2);
  }, 0) || 0;

  const { count: performanceCount } = await supabase
    .from('performance_events')
    .select('*', { count: 'exact', head: true })
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const { data: mileage } = await supabase
    .from('mileage_entries')
    .select('amount')
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const totalMileage = mileage?.reduce((sum, m) => sum + m.amount, 0) || 0;

  const { data: attendance } = await supabase
    .from('attendance')
    .select('is_tardy')
    .gte('date', format(monthStart, 'yyyy-MM-dd'))
    .lte('date', format(monthEnd, 'yyyy-MM-dd'));

  const tardyCount = attendance?.filter(a => a.is_tardy).length || 0;
  const totalAttendance = attendance?.length || 0;

  const quickActions = [
    { title: 'Employees', href: '/admin/employees', icon: <Users className="h-5 w-5" />, description: 'Manage crew' },
    { title: 'Jobs', href: '/admin/jobs', icon: <Briefcase className="h-5 w-5" />, description: 'View moves' },
    { title: 'Attendance', href: '/admin/attendance', icon: <CalendarCheck className="h-5 w-5" />, description: 'Log attendance' },
    { title: 'Damages', href: '/admin/damages', icon: <AlertTriangle className="h-5 w-5" />, description: 'Log damages' },
    { title: 'Performance', href: '/admin/performance', icon: <Star className="h-5 w-5" />, description: 'Log reviews' },
    { title: 'Mileage', href: '/admin/mileage', icon: <Car className="h-5 w-5" />, description: 'Log mileage' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Overview for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Employees</CardDescription>
            <CardTitle className="text-3xl">{employeeCount || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/employees">
              <Button variant="link" className="p-0 h-auto">
                Manage Employees →
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Jobs This Month</CardDescription>
            <CardTitle className="text-3xl">{jobCount || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/jobs">
              <Button variant="link" className="p-0 h-auto">
                View Jobs →
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tardies This Month</CardDescription>
            <CardTitle className="text-3xl">
              <span className={tardyCount === 0 ? 'text-green-600' : 'text-yellow-600'}>
                {tardyCount}
              </span>
              <span className="text-lg text-gray-400">/{totalAttendance}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/attendance">
              <Button variant="link" className="p-0 h-auto">
                View Attendance →
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Damages (Pool Impact)</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              ${totalDamages.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/damages">
              <Button variant="link" className="p-0 h-auto">
                View Damages →
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Performance Events</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {performanceCount || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/performance">
              <Button variant="link" className="p-0 h-auto">
                View Performance →
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mileage Owed</CardDescription>
            <CardTitle className="text-3xl">
              ${totalMileage.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mileage">
              <Button variant="link" className="p-0 h-auto">
                View Mileage →
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common admin tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="flex flex-col items-center p-4 rounded-lg border hover:bg-gray-50 transition-colors">
                  <div className="p-2 rounded-full bg-blue-100 text-blue-600 mb-2">
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium">{action.title}</span>
                  <span className="text-xs text-gray-500">{action.description}</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bonus Calculator Link */}
      <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <CardHeader>
          <CardTitle className="text-white">Monthly Bonus Calculator</CardTitle>
          <CardDescription className="text-blue-100">
            Calculate and preview bonus payouts for the current month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/bonus">
            <Button variant="secondary">
              Open Bonus Calculator →
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
