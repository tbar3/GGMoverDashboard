import { format, startOfMonth, endOfMonth, startOfWeek, addDays, subDays } from 'date-fns';
import { Users, UserPlus, Clock, AlertTriangle, CalendarClock } from 'lucide-react';
import { getAdminDashboard } from '@/lib/admin-metrics';
import { getDueThisQuarter, currentQuarter, quarterLabel } from '@/lib/crew-meetings';
import { BACK_OFFICE_AREAS } from '@/lib/nav';
import { AreaDashboard, type AreaStat } from '@/components/navigation/area-dashboard';

// Headcount, tardies and damages all move during the day.
export const dynamic = 'force-dynamic';

const area = BACK_OFFICE_AREAS.find((a) => a.key === 'people')!;

export default async function PeopleDashboardPage() {
  const now = new Date();
  const [d, due, quarter] = await Promise.all([
    getAdminDashboard(
      format(startOfMonth(now), 'yyyy-MM-dd'),
      format(endOfMonth(now), 'yyyy-MM-dd'),
      format(now, 'yyyy-MM-dd'),
      format(addDays(now, 6), 'yyyy-MM-dd'),
      format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      format(subDays(now, 31), 'yyyy-MM-dd')
    ),
    getDueThisQuarter(),
    currentQuarter(),
  ]);

  const overdue = due.filter((p) => p.status === 'overdue').length;

  const stats: AreaStat[] = [
    {
      icon: Users,
      label: 'Active crew',
      value: String(d.people.activeHeadcount),
      sub: d.people.inTrial > 0 ? `${d.people.inTrial} in their first month` : undefined,
      href: '/admin/employees',
    },
    {
      icon: CalendarClock,
      label: 'Reviews to book',
      value: String(due.length),
      sub:
        due.length === 0
          ? `${quarterLabel(quarter.quarter)} all booked`
          : overdue > 0
            ? `${overdue} overdue · ${quarterLabel(quarter.quarter)}`
            : quarterLabel(quarter.quarter),
      href: '/admin/meetings',
    },
    {
      icon: Clock,
      label: 'On time this week',
      value: d.people.attendanceRatePct === null ? '—' : `${d.people.attendanceRatePct}%`,
      sub: d.alerts.tardiesToday > 0 ? `${d.alerts.tardiesToday} tardy this morning` : undefined,
      href: '/admin/attendance',
    },
    {
      icon: UserPlus,
      label: 'Candidates open',
      value: String(d.people.candidatesActive),
      href: '/admin/hiring',
    },
    {
      icon: AlertTriangle,
      label: 'Damages this week',
      value: String(d.alerts.damagesThisWeek),
      href: '/admin/damages',
    },
  ];

  return <AreaDashboard area={area} stats={stats} asOf={d.dataAsOf} />;
}
