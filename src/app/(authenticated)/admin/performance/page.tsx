import {
  getWeekBoard,
  weekStartOf,
  getBonusConfig,
  getWeekStatus,
  getWeekResults,
  getWeekAdjustments,
} from '@/lib/bonus';
import { query, queryOne } from '@/lib/db';
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
  // Default to the most recent week that has imported payroll — bonuses are computed
  // from payroll hours, so the current week is empty until its payroll is imported.
  // Falls back to the current week only if no payroll has ever been imported.
  let weekStart: string;
  if (sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)) {
    weekStart = weekStartOf(sp.week);
  } else {
    const latest = await queryOne<{ w: string | null }>(
      'SELECT MAX(week_start)::text AS w FROM payroll_entries'
    );
    weekStart = latest?.w ? weekStartOf(latest.w) : weekStartOf(new Date());
  }

  const [board, employees, config, weekStatus, lockedResults, adjustments] = await Promise.all([
    getWeekBoard(weekStart),
    query<{ id: string; name: string }>(
      // One entry per person to log against — their crew record, never the login row.
      'SELECT id, name FROM employees WHERE is_active = TRUE AND exclude_from_roster = FALSE ORDER BY name'
    ),
    getBonusConfig(),
    getWeekStatus(weekStart),
    getWeekResults(weekStart),
    getWeekAdjustments(weekStart),
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
      weekStatus={weekStatus}
      lockedResults={lockedResults}
      adjustments={adjustments}
    />
  );
}
