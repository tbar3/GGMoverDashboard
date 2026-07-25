import { currentUser } from '@clerk/nextjs/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, subDays } from 'date-fns';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Briefcase,
  Users,
  Package,
  Truck,
  TrendingUp,
  Clock,
  UserPlus,
  UserX,
} from 'lucide-react';
import { getAdminDashboard, getRecentDeclines, getTerminationFlags } from '@/lib/admin-metrics';
import { getPendingNewCrewEvals } from '@/lib/new-crew-eval';

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export default async function AdminDashboardPage() {
  const user = await currentUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');
  const weekEnd = format(addDays(now, 6), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const trialCutoff = format(subDays(now, 31), 'yyyy-MM-dd');

  const [d, declines, terminationFlags, pendingEvals] = await Promise.all([
    getAdminDashboard(monthStart, monthEnd, today, weekEnd, weekStart, trialCutoff),
    getRecentDeclines(),
    getTerminationFlags(),
    getPendingNewCrewEvals(),
  ]);
  const dueEvals = pendingEvals.filter((e) => e.status !== 'upcoming');

  const alertItems = [
    { count: d.alerts.tardiesToday, label: 'tardy this morning', href: '/admin/attendance' },
    { count: d.alerts.unclosedCountSheets, label: 'unclosed count sheets', href: '/admin/materials' },
    { count: d.alerts.lowInventory, label: 'low-inventory items', href: '/admin/materials' },
    { count: d.alerts.jobsNotInSmartMoving, label: 'jobs not in SmartMoving', href: '/admin/materials' },
    { count: d.alerts.damagesThisWeek, label: 'new damages this week', href: '/admin/damages' },
  ].filter((a) => a.count > 0);

  const trucksToday = d.todaysJobs.reduce((s, j) => s + Number(j.quoted_trucks ?? 0), 0);
  const hasAlerts =
    alertItems.length > 0 ||
    d.alerts.rentalDays.length > 0 ||
    declines.length > 0 ||
    terminationFlags.length > 0 ||
    dueEvals.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Company Hub</h1>
        <p className="text-muted-foreground mt-1">
          {format(now, 'EEEE, MMMM d')}
          {d.dataAsOf && ` · jobs data as of ${d.dataAsOf}`}
        </p>
      </div>

      {/* Attention needed */}
      <Card className={hasAlerts ? 'border-destructive/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasAlerts ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            Attention Needed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAlerts ? (
            <p className="text-sm text-muted-foreground">All clear — nothing needs attention.</p>
          ) : (
            <div className="space-y-2">
              {terminationFlags.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <UserX className="h-4 w-4" />
                    {terminationFlags.length} crew flagged for termination review (3+ write-ups this month)
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {terminationFlags.map((f) => (
                      <li key={f.employeeId} className="text-sm">
                        <Link href={`/admin/employees/${f.employeeId}`} className="hover:underline">
                          <span className="font-medium">{f.employeeName}</span>
                        </Link>
                        <span className="text-muted-foreground">
                          {' '}
                          — {f.writeUpsThisMonth} write-ups in {f.monthLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dueEvals.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-500">
                    <UserPlus className="h-4 w-4" />
                    {dueEvals.length} 30-day new-crew {dueEvals.length === 1 ? 'evaluation' : 'evaluations'} due
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {dueEvals.map((ev) => (
                      <li key={ev.employeeId} className="text-sm">
                        <Link href={`/admin/employees/${ev.employeeId}`} className="hover:underline">
                          <span className="font-medium">{ev.employeeName}</span>
                        </Link>
                        <span className="text-muted-foreground">
                          {' '}
                          — {ev.status === 'overdue'
                            ? `overdue since ${format(new Date(`${ev.dueDate}T12:00:00`), 'M/d')}`
                            : `due ${format(new Date(`${ev.dueDate}T12:00:00`), 'M/d')}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {declines.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <UserX className="h-4 w-4" />
                    {declines.length} job {declines.length === 1 ? 'decline' : 'declines'} to re-staff
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {declines.map((dec) => (
                      <li key={`${dec.jobId}-${dec.employeeName}`} className="text-sm">
                        <Link href="/admin/jobs" className="hover:underline">
                          <span className="font-medium">{dec.employeeName}</span> declined{' '}
                          <span className="font-medium">{dec.customer}</span>{' '}
                          <span className="text-muted-foreground">
                            ({format(new Date(`${dec.jobDate}T12:00:00`), 'EEE M/d')})
                          </span>
                        </Link>
                        {dec.reason && (
                          <span className="text-muted-foreground"> — &ldquo;{dec.reason}&rdquo;</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.alerts.rentalDays.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <Truck className="h-4 w-4" />
                    Rental trucks needed — {d.alerts.rentalDays.length}{' '}
                    {d.alerts.rentalDays.length === 1 ? 'day' : 'days'} exceed your {d.ownedTrucks}{' '}
                    trucks
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {d.alerts.rentalDays.map((r) => (
                      <span key={r.job_date}>
                        {format(new Date(r.job_date), 'EEE M/d')}: {r.trucks} needed
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {alertItems.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <span className="text-sm">
                    <span className="font-semibold text-destructive">{a.count}</span> {a.label}
                  </span>
                  <span className="text-xs text-primary">View &rarr;</span>
                </Link>
              ))}
            </div>
          )}
          {/* Pending: packing-job materials forecast (needs SmartMoving material units). */}
          <p className="mt-3 text-xs text-muted-foreground/70">
            Packing-materials forecast pending a materials source from SmartMoving.
          </p>
        </CardContent>
      </Card>

      {/* Business KPIs */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          This Month
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={DollarSign} label="Revenue (actual)" value={money(d.kpis.revenueMtd)} />
          <StatCard icon={Briefcase} label="Jobs" value={String(d.kpis.jobsThisMonth)} />
          <StatCard
            icon={TrendingUp}
            label="Booked pipeline"
            value={money(d.kpis.bookedPipeline)}
            sub={`${d.kpis.bookedCount} booked jobs ahead`}
          />
          <StatCard icon={Package} label="Materials cost" value={money(d.kpis.materialsCostMtd)} />
          <StatCard icon={Users} label="Labor cost" value={money(d.kpis.laborCostMtd)} />
          <StatCard
            icon={DollarSign}
            label="Bonus pool"
            value="Pending"
            sub="bonus structure being finalized"
            muted
          />
        </div>
      </div>

      {/* Today's operations — from the live SmartMoving Google Calendar sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Today&apos;s Operations
              </CardTitle>
              <CardDescription>
                {d.todaysJobs.length} {d.todaysJobs.length === 1 ? 'job' : 'jobs'}
                {trucksToday > 0 && ` · ${trucksToday} trucks needed`} · from Google Calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {d.todaysJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No jobs on the calendar today. Connect and sync your SmartMoving calendar under{' '}
              <Link href="/admin/calendar" className="text-primary">
                Calendar Sync
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {d.todaysJobs.map((j, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{j.customer_name ?? 'Customer'}</span>
                      {j.job_number && (
                        <Badge variant="outline" className="text-xs">
                          {j.job_number}
                        </Badge>
                      )}
                      {j.start_time && (
                        <Badge variant="secondary" className="text-xs">
                          {j.start_time}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {j.service_type ?? 'Job'}
                      {j.crew_names && j.crew_names.length > 0
                        ? ` · ${j.crew_names.join(', ')}`
                        : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    {j.truck_name && <div className="font-medium text-foreground">{j.truck_name}</div>}
                    <div>
                      {Number(j.quoted_trucks ?? 0)} trk · {Number(j.quoted_crew ?? 0)} crew
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* People & hiring */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          People &amp; Hiring
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Active crew" value={String(d.people.activeHeadcount)} href="/admin/employees" />
          <StatCard icon={UserPlus} label="In trial month" value={String(d.people.inTrial)} href="/admin/employees" />
          <StatCard
            icon={Briefcase}
            label="Candidates in pipeline"
            value={String(d.people.candidatesActive)}
            href="/admin/hiring"
          />
          <StatCard
            icon={CheckCircle2}
            label="Attendance rate"
            value={d.people.attendanceRatePct != null ? `${d.people.attendanceRatePct}%` : '—'}
            href="/admin/attendance"
          />
        </div>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Policy sign-offs will appear here once the Policies module ships.
        </p>
      </div>

      {/* Materials insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Materials Insights
          </CardTitle>
          <CardDescription>Usage this month</CardDescription>
        </CardHeader>
        <CardContent>
          {d.materials.usageThisMonth === 0 && d.materials.topUsed.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No materials usage yet — this fills in once the crew materials app goes live in the
              hub.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total units used</p>
                <p className="text-2xl font-bold">{d.materials.usageThisMonth}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Most used</p>
                <ul className="space-y-1 text-sm">
                  {d.materials.topUsed.map((m) => (
                    <li key={m.name} className="flex justify-between">
                      <span>{m.name}</span>
                      <span className="font-medium">{m.used}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  href?: string;
  muted?: boolean;
}) {
  const inner = (
    <Card className={`h-full ${href ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        <p className={`text-3xl font-bold mt-1 ${muted ? 'text-muted-foreground' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
