import { query, queryOne } from '@/lib/db';
import { startOfWeek, format } from 'date-fns';
import { getNumberSetting } from '@/lib/settings';

/**
 * Weekly bonus engine (BONUS_FEATURE_SPEC).
 *
 *   bonus = hours × base_rate × multiplier
 *   multiplier = base_multiplier + positive_increment × (positives + perfect_week)
 *   ANY unvoided strike in the week → bonus = $0, regardless of positives.
 *
 * Weeks are Monday–Sunday (America/New_York); every event stores the Monday of
 * its week (`week_start`) so closed weeks stay closed. Hours come from the weekly
 * payroll import (Phase 2) — until then the multiplier/positives/strikes are real
 * and the dollar figure simply waits on hours.
 */

export const POSITIVE_TYPES = [
  { value: 'FIVE_STAR_REVIEW', label: '5-Star Review' },
  { value: 'CUSTOMER_CALLOUT', label: 'Customer Call-out' },
  { value: 'COMPLIANCE_PLUS', label: 'Compliance +' },
] as const;

export const STRIKE_TYPES = [
  { value: 'LATE', label: 'Late' },
  { value: 'NO_SHOW', label: 'No-Show' },
  { value: 'TRUCK_NOT_READY', label: 'Truck Not Ready' },
] as const;

export type PositiveType = (typeof POSITIVE_TYPES)[number]['value'];
export type StrikeType = (typeof STRIKE_TYPES)[number]['value'];

export function positiveLabel(t: string): string {
  return POSITIVE_TYPES.find((p) => p.value === t)?.label ?? t;
}
export function strikeLabel(t: string): string {
  return STRIKE_TYPES.find((s) => s.value === t)?.label ?? t;
}

/** The Monday (yyyy-MM-dd) of the week a date falls in. */
export function weekStartOf(date: Date | string): string {
  // Anchor string dates at noon so a UTC/ET offset can't shift the calendar day.
  const d = typeof date === 'string' ? new Date(`${date}T12:00:00`) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export interface BonusConfig {
  baseRate: number;
  increment: number;
  baseMultiplier: number;
}

export async function getBonusConfig(): Promise<BonusConfig> {
  const [baseRate, increment, baseMultiplier] = await Promise.all([
    getNumberSetting('bonus_base_rate', 1.0),
    getNumberSetting('bonus_positive_increment', 0.5),
    getNumberSetting('bonus_base_multiplier', 0.5),
  ]);
  return { baseRate, increment, baseMultiplier };
}

export interface PositiveRow {
  id: string;
  type: string;
  event_date: string;
  note: string | null;
  job_id: string | null;
}
export interface StrikeRow {
  id: string;
  type: string;
  event_date: string;
  voided: boolean;
  void_reason: string | null;
  note: string | null;
  truck_id: number | null;
}
export interface WriteUpRow {
  id: string;
  event_date: string;
  summary: string;
}
export interface WeekEvents {
  positives: PositiveRow[];
  strikes: StrikeRow[];
  writeUps: WriteUpRow[];
}

export interface WeekResult {
  hours: number;
  positivesCount: number; // logged positives, excludes the derived perfect week
  perfectWeek: boolean;
  totalPositives: number; // positivesCount + (perfectWeek ? 1 : 0)
  multiplier: number;
  hasStrike: boolean;
  bonus: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pure calculation for one employee's week. */
export function computeWeek(
  events: WeekEvents,
  hours: number,
  config: BonusConfig,
  opts?: { attendanceComplete?: boolean }
): WeekResult {
  const activeStrikes = events.strikes.filter((s) => !s.voided);
  const hasStrike = activeStrikes.length > 0;

  // Perfect Week (spec 1.3): perfect ATTENDANCE — every scheduled shift attended,
  // none late — AND no no-shows AND no write-ups. It is an affirmative signal, not
  // merely the absence of logged strikes: acceptance criterion 1 (a clean 40h week
  // with nothing logged) is 0.5×, NOT 1.0×. So it stays false until we have the
  // week's attendance (arrives with the payroll/attendance import). A truck strike
  // does not by itself break Perfect Week, though it still zeroes the bonus.
  const hasLateOrNoShow = activeStrikes.some((s) => s.type === 'LATE' || s.type === 'NO_SHOW');
  const perfectWeek =
    opts?.attendanceComplete === true && !hasLateOrNoShow && events.writeUps.length === 0;

  const positivesCount = events.positives.length;
  const totalPositives = positivesCount + (perfectWeek ? 1 : 0);
  const multiplier = config.baseMultiplier + config.increment * totalPositives;
  const bonus = hasStrike ? 0 : round2(hours * config.baseRate * multiplier);

  return { hours, positivesCount, perfectWeek, totalPositives, multiplier, hasStrike, bonus };
}

export interface BoardRow {
  employeeId: string;
  name: string;
  events: WeekEvents;
  result: WeekResult;
}

/**
 * Every active employee's events + computed result for one week, for the admin
 * Performance board. Hours come from the weekly payroll import (payroll_entries);
 * having imported hours for the week is also what turns on Perfect Week — you
 * can't be "perfect attendance" for a week we have no attendance/hours for.
 */
export async function getWeekBoard(weekStart: string): Promise<BoardRow[]> {
  const config = await getBonusConfig();
  const [employees, positives, strikes, writeUps, payroll] = await Promise.all([
    query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE is_active = TRUE ORDER BY name'
    ),
    query<PositiveRow & { employee_id: string }>(
      `SELECT id, employee_id, type, event_date::text, note, job_id
         FROM bonus_positives WHERE week_start = $1`,
      [weekStart]
    ),
    query<StrikeRow & { employee_id: string }>(
      `SELECT id, employee_id, type, event_date::text, voided, void_reason, note, truck_id
         FROM bonus_strikes WHERE week_start = $1`,
      [weekStart]
    ),
    query<WriteUpRow & { employee_id: string }>(
      `SELECT id, employee_id, event_date::text, summary
         FROM write_ups WHERE week_start = $1`,
      [weekStart]
    ),
    query<{ employee_id: string; bonus_hours: number | null }>(
      // Bonus hours = billable + warehouse (excludes marketing/office time), per
      // Trent's call — the bonus rewards field & warehouse work, not desk hours.
      `SELECT employee_id,
              COALESCE(billable_hours, 0) + COALESCE(warehouse_hours, 0) AS bonus_hours
         FROM payroll_entries WHERE week_start = $1`,
      [weekStart]
    ),
  ]);

  const forEmp = <T extends { employee_id: string }>(rows: T[], id: string) =>
    rows.filter((r) => r.employee_id === id);
  // A payroll row for the week means we have this person's hours/attendance for it.
  const hoursByEmployee = new Map(payroll.map((p) => [p.employee_id, Number(p.bonus_hours) || 0]));
  const hasPayroll = new Set(payroll.map((p) => p.employee_id));

  return employees.map((e) => {
    const events: WeekEvents = {
      positives: forEmp(positives, e.id),
      strikes: forEmp(strikes, e.id),
      writeUps: forEmp(writeUps, e.id),
    };
    const hours = hoursByEmployee.get(e.id) ?? 0;
    const result = computeWeek(events, hours, config, {
      attendanceComplete: hasPayroll.has(e.id) && hours > 0,
    });
    return { employeeId: e.id, name: e.name, events, result };
  });
}

// ── Week lifecycle (open → approved/locked) ───────────────────

export interface WeekStatus {
  status: 'open' | 'approved';
  approvedByName: string | null;
  approvedAt: string | null;
}

export async function getWeekStatus(weekStart: string): Promise<WeekStatus> {
  const row = await queryOne<{ status: string; name: string | null; approved_at: string | null }>(
    `SELECT w.status, e.name, w.approved_at::text AS approved_at
       FROM bonus_weeks w LEFT JOIN employees e ON e.id = w.approved_by
      WHERE w.week_start = $1`,
    [weekStart]
  );
  if (!row) return { status: 'open', approvedByName: null, approvedAt: null };
  return {
    status: row.status === 'approved' ? 'approved' : 'open',
    approvedByName: row.name,
    approvedAt: row.approved_at,
  };
}

export interface SnapshotRow {
  employeeId: string;
  name: string;
  hours: number;
  positivesCount: number;
  perfectWeek: boolean;
  multiplier: number;
  hasStrike: boolean;
  bonus: number;
}

/** The frozen figures for an approved week (empty if not yet locked). */
export async function getWeekResults(weekStart: string): Promise<SnapshotRow[]> {
  const rows = await query<{
    employee_id: string;
    name: string;
    hours: number;
    positives_count: number;
    perfect_week: boolean;
    multiplier: number;
    has_strike: boolean;
    bonus: number;
  }>(
    `SELECT r.employee_id, e.name, r.hours, r.positives_count, r.perfect_week,
            r.multiplier, r.has_strike, r.bonus
       FROM bonus_week_results r JOIN employees e ON e.id = r.employee_id
      WHERE r.week_start = $1 ORDER BY e.name`,
    [weekStart]
  );
  return rows.map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    hours: Number(r.hours),
    positivesCount: r.positives_count,
    perfectWeek: r.perfect_week,
    multiplier: Number(r.multiplier),
    hasStrike: r.has_strike,
    bonus: Number(r.bonus),
  }));
}

export interface AdjustmentRow {
  id: string;
  employeeId: string;
  name: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export async function getWeekAdjustments(weekStart: string): Promise<AdjustmentRow[]> {
  const rows = await query<{
    id: string;
    employee_id: string;
    name: string;
    delta: number;
    reason: string;
    created_at: string;
  }>(
    `SELECT a.id, a.employee_id, e.name, a.delta, a.reason, a.created_at::text AS created_at
       FROM bonus_adjustments a JOIN employees e ON e.id = a.employee_id
      WHERE a.week_start = $1 ORDER BY a.created_at`,
    [weekStart]
  );
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    name: r.name,
    delta: Number(r.delta),
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

// ── Crew-facing (one employee) ────────────────────────────────

/** Billable + warehouse hours for a week (the bonus basis), or 0 if no payroll yet. */
async function bonusHoursFor(employeeId: string, weekStart: string): Promise<{ hours: number; hasPayroll: boolean }> {
  const row = await queryOne<{ h: number | null }>(
    `SELECT COALESCE(billable_hours, 0) + COALESCE(warehouse_hours, 0) AS h
       FROM payroll_entries WHERE employee_id = $1 AND week_start = $2`,
    [employeeId, weekStart]
  );
  return { hours: row ? Number(row.h) || 0 : 0, hasPayroll: row != null };
}

export interface EmployeeWeek {
  weekStart: string;
  result: WeekResult;
  hasPayroll: boolean;
  positives: (PositiveRow & { label: string })[];
  strikes: (StrikeRow & { label: string })[];
  writeUps: WriteUpRow[];
  config: BonusConfig;
}

/** One employee's computed week + their events (with labels), for the crew card. */
export async function getEmployeeWeek(employeeId: string, weekStart: string): Promise<EmployeeWeek> {
  const config = await getBonusConfig();
  const [positives, strikes, writeUps, hoursInfo] = await Promise.all([
    query<PositiveRow>(
      `SELECT id, type, event_date::text, note, job_id FROM bonus_positives
        WHERE employee_id = $1 AND week_start = $2 ORDER BY event_date`,
      [employeeId, weekStart]
    ),
    query<StrikeRow>(
      `SELECT id, type, event_date::text, voided, void_reason, note, truck_id FROM bonus_strikes
        WHERE employee_id = $1 AND week_start = $2 ORDER BY event_date`,
      [employeeId, weekStart]
    ),
    query<WriteUpRow>(
      `SELECT id, event_date::text, summary FROM write_ups
        WHERE employee_id = $1 AND week_start = $2 ORDER BY event_date`,
      [employeeId, weekStart]
    ),
    bonusHoursFor(employeeId, weekStart),
  ]);

  const events: WeekEvents = { positives, strikes, writeUps };
  const result = computeWeek(events, hoursInfo.hours, config, {
    attendanceComplete: hoursInfo.hasPayroll && hoursInfo.hours > 0,
  });

  return {
    weekStart,
    result,
    hasPayroll: hoursInfo.hasPayroll,
    positives: positives.map((p) => ({ ...p, label: positiveLabel(p.type) })),
    strikes: strikes.map((s) => ({ ...s, label: strikeLabel(s.type) })),
    writeUps,
    config,
  };
}

export interface BonusHistoryRow {
  weekStart: string;
  weekEnd: string;
  hours: number;
  positivesCount: number;
  perfectWeek: boolean;
  multiplier: number;
  hasStrike: boolean;
  bonus: number;
}

/**
 * Recent weeks with a computed bonus, most recent first. Anchored on payroll weeks
 * (the closed/paid weeks that have hours) so each row shows a real dollar figure.
 */
export async function getEmployeeBonusHistory(employeeId: string, limit = 12): Promise<BonusHistoryRow[]> {
  const config = await getBonusConfig();
  const weeks = await query<{ week_start: string; week_end: string; hours: number | null }>(
    `SELECT week_start::text, week_end::text,
            COALESCE(billable_hours, 0) + COALESCE(warehouse_hours, 0) AS hours
       FROM payroll_entries WHERE employee_id = $1
      ORDER BY week_start DESC LIMIT $2`,
    [employeeId, limit]
  );
  if (weeks.length === 0) return [];

  const weekStarts = weeks.map((w) => w.week_start);
  const [positives, strikes, writeUps] = await Promise.all([
    query<PositiveRow & { week_start: string }>(
      `SELECT id, type, event_date::text, note, job_id, week_start::text FROM bonus_positives
        WHERE employee_id = $1 AND week_start = ANY($2)`,
      [employeeId, weekStarts]
    ),
    query<StrikeRow & { week_start: string }>(
      `SELECT id, type, event_date::text, voided, void_reason, note, truck_id, week_start::text FROM bonus_strikes
        WHERE employee_id = $1 AND week_start = ANY($2)`,
      [employeeId, weekStarts]
    ),
    query<WriteUpRow & { week_start: string }>(
      `SELECT id, event_date::text, summary, week_start::text FROM write_ups
        WHERE employee_id = $1 AND week_start = ANY($2)`,
      [employeeId, weekStarts]
    ),
  ]);

  return weeks.map((w) => {
    const events: WeekEvents = {
      positives: positives.filter((p) => p.week_start === w.week_start),
      strikes: strikes.filter((s) => s.week_start === w.week_start),
      writeUps: writeUps.filter((u) => u.week_start === w.week_start),
    };
    const hours = Number(w.hours) || 0;
    const r = computeWeek(events, hours, config, { attendanceComplete: hours > 0 });
    return {
      weekStart: w.week_start,
      weekEnd: w.week_end,
      hours,
      positivesCount: r.positivesCount,
      perfectWeek: r.perfectWeek,
      multiplier: r.multiplier,
      hasStrike: r.hasStrike,
      bonus: r.bonus,
    };
  });
}

export interface CompFigures {
  bonus: number;
  totalComp: number;
}
export interface PayrollComp {
  week: CompFigures & { label: string | null };
  month: CompFigures;
  ytd: CompFigures;
}

/** Actual paid bonus + total compensation for the crew Payroll cards (week / month / YTD). */
export async function getPayrollComp(employeeId: string, today: Date): Promise<PayrollComp> {
  const y = today.getFullYear();
  const monthStart = `${y}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${y}-01-01`;

  const [latest, month, ytd] = await Promise.all([
    queryOne<{ bonus: number | null; comp: number | null; week_start: string; week_end: string }>(
      `SELECT bonus_amount AS bonus, total_compensation AS comp, week_start::text, week_end::text
         FROM payroll_entries WHERE employee_id = $1 ORDER BY week_start DESC LIMIT 1`,
      [employeeId]
    ),
    queryOne<{ bonus: number | null; comp: number | null }>(
      `SELECT COALESCE(SUM(bonus_amount),0) AS bonus, COALESCE(SUM(total_compensation),0) AS comp
         FROM payroll_entries WHERE employee_id = $1 AND week_start >= $2`,
      [employeeId, monthStart]
    ),
    queryOne<{ bonus: number | null; comp: number | null }>(
      `SELECT COALESCE(SUM(bonus_amount),0) AS bonus, COALESCE(SUM(total_compensation),0) AS comp
         FROM payroll_entries WHERE employee_id = $1 AND week_start >= $2`,
      [employeeId, yearStart]
    ),
  ]);

  return {
    week: {
      bonus: Number(latest?.bonus) || 0,
      totalComp: Number(latest?.comp) || 0,
      label: latest ? latest.week_start : null,
    },
    month: { bonus: Number(month?.bonus) || 0, totalComp: Number(month?.comp) || 0 },
    ytd: { bonus: Number(ytd?.bonus) || 0, totalComp: Number(ytd?.comp) || 0 },
  };
}
