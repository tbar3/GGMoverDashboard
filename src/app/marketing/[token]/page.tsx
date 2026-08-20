import { addDays, format } from 'date-fns';
import { query, queryOne } from '@/lib/db';
import { weekStartOf } from '@/lib/bonus';
import { MarketingDayForm } from './marketing-day-form';

export const dynamic = 'force-dynamic';

export default async function MarketingLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { token } = await params;
  const { week } = await searchParams;

  const emp = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE marketing_token = $1 AND is_active = TRUE',
    [token]
  );

  if (!emp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-bold">Link not found</h1>
          <p className="text-muted-foreground">
            This marketing-hours link is invalid or expired. Ask your manager for a new one.
          </p>
        </div>
      </div>
    );
  }

  const weekStart =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartOf(week) : weekStartOf(new Date());
  const start = new Date(`${weekStart}T12:00:00`);
  const weekEnd = format(addDays(start, 6), 'yyyy-MM-dd');
  const prevWeek = format(addDays(start, -7), 'yyyy-MM-dd');
  const nextWeek = format(addDays(start, 7), 'yyyy-MM-dd');

  const saved = await query<{ date: string; hours: number }>(
    'SELECT date::text AS date, hours FROM marketing_day_hours WHERE employee_id = $1 AND date >= $2 AND date <= $3',
    [emp.id, weekStart, weekEnd]
  );
  const byDate = new Map(saved.map((r) => [r.date, Number(r.hours)]));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = format(addDays(start, i), 'yyyy-MM-dd');
    return { date: d, label: format(addDays(start, i), 'EEEE, MMM d'), hours: byDate.get(d) ?? null };
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-lg">
        <MarketingDayForm
          token={token}
          employeeName={emp.name}
          weekLabel={`${format(start, 'MMM d')} – ${format(addDays(start, 6), 'MMM d, yyyy')}`}
          prevWeek={prevWeek}
          nextWeek={nextWeek}
          days={days}
        />
      </div>
    </div>
  );
}
