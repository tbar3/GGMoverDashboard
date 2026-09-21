import { format, startOfMonth, endOfMonth, startOfWeek, addDays, subDays } from 'date-fns';
import { Briefcase, Truck, AlertTriangle, TrendingUp } from 'lucide-react';
import { getAdminDashboard } from '@/lib/admin-metrics';
import { BACK_OFFICE_AREAS } from '@/lib/nav';
import { AreaDashboard, type AreaStat } from '@/components/navigation/area-dashboard';

// Today's jobs and truck demand change under you through the day.
export const dynamic = 'force-dynamic';

const area = BACK_OFFICE_AREAS.find((a) => a.key === 'operations')!;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function OperationsDashboardPage() {
  const now = new Date();
  const d = await getAdminDashboard(
    format(startOfMonth(now), 'yyyy-MM-dd'),
    format(endOfMonth(now), 'yyyy-MM-dd'),
    format(now, 'yyyy-MM-dd'),
    format(addDays(now, 6), 'yyyy-MM-dd'),
    format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    format(subDays(now, 31), 'yyyy-MM-dd')
  );

  const trucksToday = d.todaysJobs.reduce((sum, j) => sum + Number(j.quoted_trucks ?? 0), 0);

  const stats: AreaStat[] = [
    {
      icon: Briefcase,
      label: 'Jobs today',
      value: String(d.todaysJobs.length),
      sub: trucksToday > 0 ? `${trucksToday} trucks quoted` : undefined,
      href: '/admin/jobs',
    },
    {
      icon: Truck,
      label: 'Trucks owned',
      value: String(d.ownedTrucks),
      sub: 'excludes trailers and rentals',
      href: '/admin/rentals',
    },
    {
      icon: AlertTriangle,
      label: 'Days short a truck',
      value: String(d.alerts.rentalDays.length),
      sub: d.alerts.rentalDays.length > 0 ? 'in the next 7 days' : 'next 7 days covered',
      href: '/admin/rentals',
    },
    {
      icon: TrendingUp,
      label: 'Revenue MTD',
      value: money(d.kpis.revenueMtd),
      sub: `${d.kpis.jobsThisMonth} jobs this month`,
      href: '/admin/profitability',
    },
  ];

  return <AreaDashboard area={area} stats={stats} asOf={d.dataAsOf} />;
}
