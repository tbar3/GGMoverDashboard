import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, AlertTriangle, Star, Car, CalendarCheck, CalendarSync } from 'lucide-react';

export default async function AdminDashboardPage() {
  const user = await currentUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const [employeeCountRes, jobCountRes, damages, performanceCountRes, mileage, attendance] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) as count FROM employees WHERE is_active = true'),
    query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
    query<{ amount: number; was_reported: boolean }>('SELECT amount, was_reported FROM damages WHERE created_at >= $1 AND created_at <= $2', [monthStart, monthEnd]),
    query<{ count: string }>('SELECT COUNT(*) as count FROM performance_events WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
    query<{ amount: number }>('SELECT amount FROM mileage_entries WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
    query<{ is_tardy: boolean }>('SELECT is_tardy FROM attendance WHERE date >= $1 AND date <= $2', [monthStart, monthEnd]),
  ]);

  const employeeCount = parseInt(employeeCountRes[0]?.count || '0');
  const jobCount = parseInt(jobCountRes[0]?.count || '0');
  const performanceCount = parseInt(performanceCountRes[0]?.count || '0');

  const totalDamages = damages.reduce((sum, d) => {
    return sum + (d.was_reported ? Number(d.amount) : Number(d.amount) * 2);
  }, 0);

  const totalMileage = mileage.reduce((sum, m) => sum + Number(m.amount), 0);
  const tardyCount = attendance.filter(a => a.is_tardy).length;
  const totalAttendance = attendance.length;

  const quickActions = [
    { title: 'Employees', href: '/admin/employees', icon: <Users className="h-5 w-5" />, description: 'Manage crew' },
    { title: 'Jobs', href: '/admin/jobs', icon: <Briefcase className="h-5 w-5" />, description: 'View moves' },
    { title: 'Attendance', href: '/admin/attendance', icon: <CalendarCheck className="h-5 w-5" />, description: 'Log attendance' },
    { title: 'Damages', href: '/admin/damages', icon: <AlertTriangle className="h-5 w-5" />, description: 'Log damages' },
    { title: 'Performance', href: '/admin/performance', icon: <Star className="h-5 w-5" />, description: 'Log reviews' },
    { title: 'Mileage', href: '/admin/mileage', icon: <Car className="h-5 w-5" />, description: 'Log mileage' },
    { title: 'Calendar Sync', href: '/admin/calendar', icon: <CalendarSync className="h-5 w-5" />, description: 'Import jobs' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/admin/employees">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Active Employees</CardDescription>
              <CardTitle className="text-3xl">{employeeCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">Manage Employees &rarr;</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/jobs">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Jobs This Month</CardDescription>
              <CardTitle className="text-3xl">{jobCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">View Jobs &rarr;</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/attendance">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Tardies This Month</CardDescription>
              <CardTitle className="text-3xl">
                <span className={tardyCount === 0 ? 'text-green-600' : 'text-destructive'}>
                  {tardyCount}
                </span>
                <span className="text-lg text-muted-foreground/70">/{totalAttendance}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">View Attendance &rarr;</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/damages">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Damages (Pool Impact)</CardDescription>
              <CardTitle className="text-3xl text-destructive">
                ${totalDamages.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">View Damages &rarr;</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/performance">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Performance Events</CardDescription>
              <CardTitle className="text-3xl text-green-600">{performanceCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">View Performance &rarr;</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/mileage">
          <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
            <CardHeader className="pb-2">
              <CardDescription>Mileage Owed</CardDescription>
              <CardTitle className="text-3xl">${totalMileage.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-primary">View Mileage &rarr;</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common admin tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted transition-colors">
                  <div className="p-2 rounded-full bg-secondary text-primary mb-2">
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium">{action.title}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-brand-navy to-[#01405F] text-primary-foreground">
        <CardHeader>
          <CardTitle className="text-white">Monthly Bonus Calculator</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Calculate and preview bonus payouts for the current month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/bonus">
            <Button variant="secondary">Open Bonus Calculator →</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
