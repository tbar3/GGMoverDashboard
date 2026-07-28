import { getCurrentEmployee } from '@/lib/auth';
import {
  getEmployeeWeek,
  getEmployeeBonusHistory,
  getPayrollComp,
  getEmployeeEvents,
  weekStartOf,
} from '@/lib/bonus';
import { Card, CardContent } from '@/components/ui/card';
import { WeeklyBonusCard, BonusHistoryTable, PayrollCompCards } from '@/components/crew/weekly-bonus';
import { EventsTable } from '@/components/crew/events-table';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function MyBonusPage() {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Employee profile not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const weekStart = weekStartOf(now);
  const [week, history, comp, events] = await Promise.all([
    getEmployeeWeek(employee.id, weekStart),
    getEmployeeBonusHistory(employee.id, 12),
    getPayrollComp(employee.id, now),
    getEmployeeEvents(employee.id, 100),
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader titleKey="bonus.title" subtitleKey="bonus.subtitle" />
      <WeeklyBonusCard week={week} />
      <PayrollCompCards comp={comp} />
      <BonusHistoryTable history={history} />
      <EventsTable
        events={events}
        title="Your events"
        description="Every positive, GG Point, strike, and write-up on your record."
        empty="No events yet — a clean slate."
      />
    </div>
  );
}
