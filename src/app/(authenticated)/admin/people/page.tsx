import { format, startOfMonth, endOfMonth, startOfWeek, addDays, subDays } from 'date-fns';
import { Users, UserPlus, Clock, AlertTriangle, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getAdminDashboard } from '@/lib/admin-metrics';
import { BACK_OFFICE_AREAS } from '@/lib/nav';
import { AreaDashboard, type AreaStat } from '@/components/navigation/area-dashboard';

// Headcount, tardies and damages all move during the day.
export const dynamic = 'force-dynamic';

const area = BACK_OFFICE_AREAS.find((a) => a.key === 'people')!;

export default async function PeopleDashboardPage() {
  const now = new Date();
  const d = await getAdminDashboard(
    format(startOfMonth(now), 'yyyy-MM-dd'),
    format(endOfMonth(now), 'yyyy-MM-dd'),
    format(now, 'yyyy-MM-dd'),
    format(addDays(now, 6), 'yyyy-MM-dd'),
    format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    format(subDays(now, 31), 'yyyy-MM-dd')
  );

  const stats: AreaStat[] = [
    {
      icon: Users,
      label: 'Active crew',
      value: String(d.people.activeHeadcount),
      sub: d.people.inTrial > 0 ? `${d.people.inTrial} in their first month` : undefined,
      href: '/admin/employees',
    },
    {
      icon: UserPlus,
      label: 'Candidates open',
      value: String(d.people.candidatesActive),
      href: '/admin/hiring',
    },
    {
      icon: Clock,
      label: 'On time this week',
      value:
        d.people.attendanceRatePct === null ? '—' : `${d.people.attendanceRatePct}%`,
      sub: d.alerts.tardiesToday > 0 ? `${d.alerts.tardiesToday} tardy this morning` : undefined,
      href: '/admin/attendance',
    },
    {
      icon: AlertTriangle,
      label: 'Damages this week',
      value: String(d.alerts.damagesThisWeek),
      href: '/admin/damages',
    },
  ];

  return (
    <AreaDashboard area={area} stats={stats} asOf={d.dataAsOf}>
      {/*
        The reserved slot for crew meeting scheduling — feedback, promotion and
        quarterly reviews. Deliberately NOT a link: the module does not exist yet,
        and a nav card pointing at a route that isn't there is the dead link this
        app's nav config explicitly sets out to avoid.
      */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-muted-foreground">Crew meetings — not built yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scheduling feedback sessions, promotion conversations and quarterly reviews lands
              here as its own module.
            </p>
          </div>
        </CardContent>
      </Card>
    </AreaDashboard>
  );
}
