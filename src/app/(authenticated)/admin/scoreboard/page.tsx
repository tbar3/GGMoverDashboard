import { getWeekBoard, weekStartOf, crewWeekScore } from '@/lib/bonus';
import { query } from '@/lib/db';
import { addDays, format } from 'date-fns';
import { roleLabel } from '@/lib/roles';
import { ScoreboardTable, type ScoreRow } from './scoreboard-content';

export const dynamic = 'force-dynamic';

function labelForWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = addDays(start, 6);
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

const shift = (weekStart: string, days: number) =>
  weekStartOf(format(addDays(new Date(`${weekStart}T12:00:00`), days), 'yyyy-MM-dd'));

export default async function ScoreboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const thisWeek = weekStartOf(new Date());
  const lastWeek = shift(thisWeek, -7);
  // Default to LAST week (the most recent completed week) — that's what you use to
  // prioritize the coming week. A ?week=YYYY-MM-DD lets you page through history.
  const weekStart =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStartOf(sp.week) : lastWeek;

  const [board, roleRows] = await Promise.all([
    getWeekBoard(weekStart),
    query<{ id: string; role: string }>(
      'SELECT id, role FROM employees WHERE is_active = TRUE'
    ),
  ]);

  const roleById = new Map(roleRows.map((r) => [r.id, r.role]));

  const rows: ScoreRow[] = board.map((b) => ({
    employeeId: b.employeeId,
    name: b.name,
    role: roleLabel(roleById.get(b.employeeId) ?? ''),
    positives: b.result.totalPositives,
    strikes: b.result.strikeCount,
    writeUps: b.events.writeUps.length,
    multiplier: b.result.multiplier,
    score: crewWeekScore(b.result),
  }));

  return (
    <ScoreboardTable
      rows={rows}
      weekLabel={labelForWeek(weekStart)}
      isCurrentWeek={weekStart === thisWeek}
      prevWeek={shift(weekStart, -7)}
      nextWeek={shift(weekStart, 7)}
    />
  );
}
