import { query } from '@/lib/db';

/**
 * The payroll record over time.
 *
 * Every figure here comes from payroll_runs / payroll_run_lines — the frozen
 * snapshots written at close — never from a recomputation. That is what makes it
 * safe to chart: the line for a week in March cannot move because someone edited
 * something in September.
 */

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export interface ClosedWeekRow {
  id: string;
  weekStart: string;
  version: number;
  grossPayroll: number;
  bonusTotal: number;
  reimbursementTotal: number;
  totalHours: number;
  headcount: number;
  revenue: number | null;
  /** Percent, e.g. 34.2 — null when no revenue was recorded for the week. */
  laborRatio: number | null;
  closedAt: string;
  closedByName: string;
  note: string | null;
}

/** Closed weeks, newest first. Superseded versions are excluded. */
export async function getClosedWeeks(limit = 52): Promise<ClosedWeekRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, week_start::text AS week_start, version, gross_payroll, bonus_total,
            reimbursement_total, total_hours, headcount, revenue, labor_ratio,
            closed_at::text AS closed_at, closed_by_name, note
       FROM payroll_runs
      WHERE reopened_at IS NULL
      ORDER BY week_start DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: String(r.id),
    weekStart: String(r.week_start),
    version: Number(r.version),
    grossPayroll: num(r.gross_payroll),
    bonusTotal: num(r.bonus_total),
    reimbursementTotal: num(r.reimbursement_total),
    totalHours: num(r.total_hours),
    headcount: Number(r.headcount),
    revenue: r.revenue != null ? num(r.revenue) : null,
    laborRatio: r.labor_ratio != null ? round1(num(r.labor_ratio) * 100) : null,
    closedAt: String(r.closed_at),
    closedByName: String(r.closed_by_name),
    note: r.note != null ? String(r.note) : null,
  }));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Oldest-first, for charting. */
export async function getPayrollTrend(limit = 26): Promise<ClosedWeekRow[]> {
  const rows = await getClosedWeeks(limit);
  return rows.slice().reverse();
}

export interface AmendmentRow {
  weekStart: string;
  version: number;
  grossPayroll: number;
  closedAt: string;
  closedByName: string;
  reopenedAt: string | null;
  reopenReason: string | null;
}

/**
 * Weeks that were closed more than once, with every version.
 *
 * A week appearing here is not a problem in itself — it means something was found
 * and corrected. What matters is that the earlier figure and the reason are both
 * still readable.
 */
export async function getAmendedWeeks(): Promise<AmendmentRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT week_start::text AS week_start, version, gross_payroll,
            closed_at::text AS closed_at, closed_by_name,
            reopened_at::text AS reopened_at, reopen_reason
       FROM payroll_runs
      WHERE week_start IN (
        SELECT week_start FROM payroll_runs GROUP BY week_start HAVING COUNT(*) > 1
      )
      ORDER BY week_start DESC, version DESC`
  );
  return rows.map((r) => ({
    weekStart: String(r.week_start),
    version: Number(r.version),
    grossPayroll: num(r.gross_payroll),
    closedAt: String(r.closed_at),
    closedByName: String(r.closed_by_name),
    reopenedAt: r.reopened_at != null ? String(r.reopened_at) : null,
    reopenReason: r.reopen_reason != null ? String(r.reopen_reason) : null,
  }));
}

export interface EmployeePayWeek {
  weekStart: string;
  totalHours: number;
  bonus: number;
  totalCompensation: number;
}

/** One person's pay across closed weeks — what the per-employee snapshot is for. */
export async function getEmployeePayHistory(
  employeeId: string,
  limit = 26
): Promise<EmployeePayWeek[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT r.week_start::text AS week_start, l.total_hours, l.bonus, l.total_compensation
       FROM payroll_run_lines l
       JOIN payroll_runs r ON r.id = l.run_id
      WHERE l.employee_id = $1 AND r.reopened_at IS NULL
      ORDER BY r.week_start DESC
      LIMIT $2`,
    [employeeId, limit]
  );
  return rows.map((r) => ({
    weekStart: String(r.week_start),
    totalHours: num(r.total_hours),
    bonus: num(r.bonus),
    totalCompensation: num(r.total_compensation),
  }));
}
