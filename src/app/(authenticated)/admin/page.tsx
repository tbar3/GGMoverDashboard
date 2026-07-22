import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { LIVE_AREAS, PLANNED_AREAS } from '@/lib/nav';

export default async function CompanyHubPage() {
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Company Hub</h1>
        <p className="text-muted-foreground mt-1">
          Everything GoodGuys, in one place — {format(now, 'MMMM yyyy')}
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

      {/* One section per live area — same config the sidebar renders from. */}
      {LIVE_AREAS.map((area) => {
        const AreaIcon = area.icon;
        return (
          <Card key={area.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AreaIcon className="h-5 w-5 text-primary" />
                {area.label}
              </CardTitle>
              <CardDescription>{area.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {area.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className="flex items-start gap-3 p-4 h-full rounded-lg border hover:bg-muted transition-colors">
                        <div className="p-2 rounded-full bg-secondary text-primary shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Modules still to come. Not links — these routes don't exist yet. */}
      <Card>
        <CardHeader>
          <CardTitle>Coming to the hub</CardTitle>
          <CardDescription>
            Modules being consolidated into this dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLANNED_AREAS.map((area) => {
              const Icon = area.icon;
              return (
                <div
                  key={area.key}
                  className="flex items-start gap-3 p-4 h-full rounded-lg border border-dashed bg-muted/40"
                >
                  <div className="p-2 rounded-full bg-secondary text-muted-foreground shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      {area.label}
                    </p>
                    <p className="text-xs text-muted-foreground/80">{area.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
