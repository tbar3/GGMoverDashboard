import { query } from '@/lib/db';
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
