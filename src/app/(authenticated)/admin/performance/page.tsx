import { getWeekBoard, weekStartOf, getBonusConfig } from '@/lib/bonus';
import { query } from '@/lib/db';
import { addDays, format } from 'date-fns';
import PerformanceBoard from './performance-board';

export const dynamic = 'force-dynamic';

function labelForWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = addDays(start, 6);
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const weekStart =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStartOf(sp.week) : weekStartOf(new Date());

  const [board, employees, config] = await Promise.all([
    getWeekBoard(weekStart),
    query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE is_active = TRUE ORDER BY name'
    ),
    getBonusConfig(),
  ]);

  const prevWeek = weekStartOf(format(addDays(new Date(`${weekStart}T12:00:00`), -7), 'yyyy-MM-dd'));
  const nextWeek = weekStartOf(format(addDays(new Date(`${weekStart}T12:00:00`), 7), 'yyyy-MM-dd'));
  const thisWeek = weekStartOf(new Date());

  return (
    <PerformanceBoard
      board={board}
      employees={employees}
      weekStart={weekStart}
      weekLabel={labelForWeek(weekStart)}
      isCurrentWeek={weekStart === thisWeek}
      prevWeek={prevWeek}
      nextWeek={nextWeek}
      config={config}
    />
  );
}
