import { getCurrentEmployee } from '@/lib/auth';
import { getEmployeeEvents, getEmployeeWeek, weekStartOf } from '@/lib/bonus';
import { Card, CardContent } from '@/components/ui/card';
import { EventsTable } from '@/components/crew/events-table';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, negative }: { label: string; value: string | number; negative?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${negative && Number(value) > 0 ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function PerformancePage() {
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
  const [events, week] = await Promise.all([
    getEmployeeEvents(employee.id, 200),
    getEmployeeWeek(employee.id, weekStartOf(now)),
  ]);

  const monthPrefix = format(now, 'yyyy-MM');
  const month = events.filter((e) => e.date.startsWith(monthPrefix));
  const positives = month.filter((e) => e.kind === 'positive' || e.kind === 'gg_point').length;
  const strikes = month.filter((e) => e.kind === 'strike' && !e.voided).length;
  const writeups = month.filter((e) => e.kind === 'writeup').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Performance</h1>
        <p className="text-muted-foreground mt-1">Your event record and how it drives your bonus.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="This week's multiplier" value={week.result.hasStrike && week.result.multiplier === 0 ? 'Forfeit' : `${week.result.multiplier}x`} />
        <StatCard label="Positives this month" value={positives} />
        <StatCard label="Strikes this month" value={strikes} negative />
        <StatCard label="Write-ups this month" value={writeups} negative />
      </div>

      <EventsTable
        events={events}
        title="Your performance record"
        description="Positives and GG Points lift your bonus; strikes forfeit it. Write-ups are formal notices."
        empty="No events yet - keep it clean."
      />
    </div>
  );
}
