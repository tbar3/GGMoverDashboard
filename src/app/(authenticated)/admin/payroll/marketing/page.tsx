import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { query } from '@/lib/db';
import { weekStartOf } from '@/lib/bonus';
import { MarketingForm } from './marketing-form';

interface EmpMarketing {
  id: string;
  name: string;
  hours: number | null;
  token: string;
}

export default async function MarketingHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartOf(week) : weekStartOf(format(new Date(), 'yyyy-MM-dd'));

  const employees = await query<EmpMarketing>(
    `SELECT e.id, e.name, e.marketing_token AS token, mh.hours
       FROM employees e
       LEFT JOIN marketing_hours mh ON mh.employee_id = e.id AND mh.week_start = $1
      WHERE e.is_active = TRUE
      ORDER BY e.name`,
    [weekStart]
  );

  const rows = employees.map((e) => ({
    id: e.id,
    name: e.name,
    token: e.token,
    hours: e.hours == null ? null : Number(e.hours),
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Marketing Hours</h1>
        <p className="text-muted-foreground mt-1">
          Enter weekly marketing hours, or send each person their own link so they can fill in their
          days themselves. These feed the payroll run like warehouse and job hours (and count toward
          overtime).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Week of {weekStart}</CardTitle>
          <CardDescription>Only people with hours need an entry — leave the rest blank.</CardDescription>
        </CardHeader>
        <CardContent>
          <MarketingForm weekStart={weekStart} employees={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
