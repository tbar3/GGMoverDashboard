import { queryOne } from '@/lib/db';
import type { ClosedRunMeta } from '@/lib/payroll-run';
import { CloseWeekControls } from './close-week-controls';

/**
 * Whether this week is still moving, and the controls to stop it moving.
 *
 * The bonus week's status is fetched here because it gates closing: until the
 * bonus is approved its numbers are still being recalculated, so a payroll close
 * would freeze a figure that can still change.
 */
export async function WeekStatusBar({
  weekStart,
  closed,
}: {
  weekStart: string;
  closed: ClosedRunMeta | null;
}) {
  const bonusWeek = await queryOne<{ status: string }>(
    'SELECT status FROM bonus_weeks WHERE week_start = $1',
    [weekStart]
  );

  return (
    <CloseWeekControls
      weekStart={weekStart}
      closed={
        closed && {
          version: closed.version,
          closedAt: closed.closedAt,
          closedByName: closed.closedByName,
          grossPayroll: closed.grossPayroll,
          note: closed.note,
        }
      }
      bonusApproved={bonusWeek?.status === 'approved'}
      bonusWeekStatus={bonusWeek?.status ?? null}
    />
  );
}
