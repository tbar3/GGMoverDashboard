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
  { value: 'FIVE_STAR_REVIEW', label: '5-Star Review (whole crew)' },
  { value: 'CUSTOMER_CALLOUT', label: 'Customer Shoutout' },
  { value: 'COMPLIANCE_PLUS', label: 'Compliance Plus (audit pass)' },
] as const;

export const STRIKE_TYPES = [
  { value: 'LATE', label: 'Late' },
  { value: 'CALL_OUT', label: 'Call-Out (after Sun 3PM)' },
  { value: 'NO_SHOW', label: 'No-Show' },
  { value: 'TOOLS', label: 'No Tools (lead/driver)' },
  { value: 'UNIFORM', label: 'Uniform' },
  { value: 'ARRIVAL_WINDOW', label: 'Missed Arrival Window' },
  { value: 'NON_COMPLIANCE', label: 'Failed Audit (<70%)' },
  { value: 'TRUCK_NOT_READY', label: 'Truck Not Ready (whole crew)' },
] as const;

export type PositiveType = (typeof POSITIVE_TYPES)[number]['value'];
export type StrikeType = (typeof STRIKE_TYPES)[number]['value'];

export const GG_POINT_TYPE = 'GG_POINT';

export function positiveLabel(t: string): string {
  if (t === GG_POINT_TYPE) return 'GG Point';
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
  forfeitThreshold: number; // strikes in a week that wipe even discretionary GG points
  driverWeekly: number; // automatic +x for certified drivers
  truckLeadWeekly: number; // automatic +x for 2-truck job leads
}

export async function getBonusConfig(): Promise<BonusConfig> {
  const [baseRate, increment, baseMultiplier, forfeitThreshold, driverWeekly, truckLeadWeekly] =
    await Promise.all([
      getNumberSetting('bonus_base_rate', 1.0),
      getNumberSetting('bonus_positive_increment', 0.5),
      getNumberSetting('bonus_base_multiplier', 0.5),
      getNumberSetting('bonus_strike_forfeit_threshold', 3),
      getNumberSetting('bonus_driver_weekly', 0.25),
      getNumberSetting('bonus_truck_lead_weekly', 0.25),
    ]);
  return { baseRate, increment, baseMultiplier, forfeitThreshold, driverWeekly, truckLeadWeekly };
}

// Automatic weekly role add-ons from a crew member's certifications.
async function roleAutoBonusMap(config: BonusConfig): Promise<Map<string, number>> {
  const rows = await query<{ employee_id: string; name: string }>(
    `SELECT es.employee_id, s.name FROM employee_skills es JOIN skills s ON s.id = es.skill_id
      WHERE s.name IN ('Driver', '2-Truck Job Lead')`
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const add = r.name === 'Driver' ? config.driverWeekly : config.truckLeadWeekly;
    map.set(r.employee_id, (map.get(r.employee_id) ?? 0) + add);
  }
  return map;
}

async function roleAutoBonusFor(employeeId: string, config: BonusConfig): Promise<number> {
  const rows = await query<{ name: string }>(
    `SELECT s.name FROM employee_skills es JOIN skills s ON s.id = es.skill_id
      WHERE es.employee_id = $1 AND s.name IN ('Driver', '2-Truck Job Lead')`,
    [employeeId]
  );
  return rows.reduce((b, r) => b + (r.name === 'Driver' ? config.driverWeekly : config.truckLeadWeekly), 0);
}

export interface RoleBonus {
  label: string;
  amount: number;
}

/** The itemized role add-ons (Driver / 2-Truck Lead) a crew member earns from their skills. */
async function roleAutoBonusDetailFor(employeeId: string, config: BonusConfig): Promise<RoleBonus[]> {
  const rows = await query<{ name: string }>(
    `SELECT s.name FROM employee_skills es JOIN skills s ON s.id = es.skill_id
      WHERE es.employee_id = $1 AND s.name IN ('Driver', '2-Truck Job Lead')`,
    [employeeId]
  );
  return rows.map((r) => ({
    label: r.name === 'Driver' ? 'Driver' : '2-Truck Lead',
    amount: r.name === 'Driver' ? config.driverWeekly : config.truckLeadWeekly,
  }));
}

export interface PositiveRow {
  id: string;
  type: string;
  event_date: string;
  note: string | null;
  job_id: string | null;
  discretionary: boolean;
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
  positivesCount: number; // GG points logged (non-discretionary)
  discretionaryCount: number; // discretionary GG points
  autoBonus: number; // automatic role add-ons (driver / 2-truck lead), in multiplier units
  perfectWeek: boolean; // deprecated by policy; kept false
  totalPositives: number;
  strikeCount: number;
  grossMultiplier: number; // what they'd earn with no strikes (normal + discretionary)
  multiplier: number; // EFFECTIVE multiplier after strike rules — drives the bonus
  hasStrike: boolean;
  bonus: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure calculation for one employee's week.
 *
 * GG Points: each 0.5× is a "GG Point". Discretionary GG Points are hand-awarded and
 * strike-proof — a strike forfeits the NORMAL bonus (base + positives + perfect week)
 * but the discretionary 0.5× per point is retained, UNTIL the week hits the forfeit
 * threshold of strikes (3), which wipes everything including GG Points.
 */
export function computeWeek(
  events: WeekEvents,
  hours: number,
  config: BonusConfig,
  opts?: { autoBonus?: number; baseMultiplier?: number }
): WeekResult {
  const activeStrikes = events.strikes.filter((s) => !s.voided);
  const strikeCount = activeStrikes.length;
  const hasStrike = strikeCount > 0;

  // Perfect Week was dropped in the final policy — GG points + role add-ons only.
  const perfectWeek = false;

  const positivesCount = events.positives.filter((p) => !p.discretionary).length;
  const discretionaryCount = events.positives.filter((p) => p.discretionary).length;
  const totalPositives = positivesCount;

  // Per-employee base multiplier override falls back to the company default.
  const base = opts?.baseMultiplier ?? config.baseMultiplier;

  // Automatic weekly role add-ons (Driver / 2-Truck Lead) count with the normal
  // bonus — a strike forfeits them like everything else.
  const autoBonus = Math.max(0, opts?.autoBonus ?? 0);
  const normalMultiplier = base + config.increment * totalPositives + autoBonus;
  const discretionaryValue = config.increment * discretionaryCount;
  const grossMultiplier = normalMultiplier + discretionaryValue;

  let multiplier: number;
  if (strikeCount >= config.forfeitThreshold) {
    multiplier = 0; // too many strikes — even GG Points are lost
  } else if (strikeCount >= 1) {
    multiplier = discretionaryValue; // normal bonus forfeited, GG Points retained
  } else {
    multiplier = grossMultiplier;
  }

  const bonus = round2(hours * config.baseRate * multiplier);

  return {
    hours,
    positivesCount,
    discretionaryCount,
    autoBonus,
    perfectWeek,
    totalPositives,
    strikeCount,
    grossMultiplier,
    multiplier,
    hasStrike,
    bonus,
  };
}

export interface BoardRow {
  employeeId: string;
  name: string;
  events: WeekEvents;
  result: WeekResult;
  estHours: number; // estimated hours from the week's assigned jobs
  estBonus: number; // projected bonus = estHours × baseRate × multiplier
}

/**
 * A single sortable "who had the best/worst week" score for the crew scoreboard.
 *
 * Starts from the week's EFFECTIVE bonus multiplier (base + positives, with the
 * normal strike rules already applied — a strike forfeits the normal bonus but keeps
 * discretionary GG Points, and the forfeit threshold zeroes everything). Then, per
 * Trent's rule, every strike AFTER the first knocks off another 0.1, so repeat
 * offenders sort to the bottom (and can go negative):
 *   0 strikes → multiplier
 *   1 strike  → multiplier (already reflects the forfeit) − 0.0
 *   2 strikes → − 0.1
 *   3 strikes → multiplier is 0 at the forfeit threshold, then − 0.2
 */
export function crewWeekScore(result: WeekResult): number {
  const extraStrikePenalty = 0.1 * Math.max(0, result.strikeCount - 1);
  return round2(result.multiplier - extraStrikePenalty);
}

/**
 * Every active employee's events + computed result for one week, for the admin
 * Performance board. Hours come from the weekly payroll import (payroll_entries);
 * having imported hours for the week is also what turns on Perfect Week — you
 * can't be "perfect attendance" for a week we have no attendance/hours for.
 */
export async function getWeekBoard(weekStart: string): Promise<BoardRow[]> {
  const config = await getBonusConfig();
  const [employees, positives, strikes, writeUps, payroll, estimated] = await Promise.all([
    query<{ id: string; name: string; base_multiplier: number | null }>(
      'SELECT id, name, base_multiplier FROM employees WHERE is_active = TRUE ORDER BY name'
    ),
    query<PositiveRow & { employee_id: string }>(
      `SELECT id, employee_id, type, event_date::text, note, job_id, discretionary
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
    // Estimated hours from the jobs each crew member is assigned to this week —
    // lets us project the bonus before the payroll import lands.
    query<{ employee_id: string; est_hours: number }>(
      `SELECT c.employee_id, COALESCE(SUM(j.estimated_hours), 0)::float8 AS est_hours
         FROM jobs j, unnest(j.crew_ids) AS c(employee_id)
        WHERE j.date >= $1 AND j.date <= $1::date + 6
        GROUP BY c.employee_id`,
      [weekStart]
    ),
  ]);

  const forEmp = <T extends { employee_id: string }>(rows: T[], id: string) =>
    rows.filter((r) => r.employee_id === id);
  const hoursByEmployee = new Map(payroll.map((p) => [p.employee_id, Number(p.bonus_hours) || 0]));
  const estByEmployee = new Map(estimated.map((r) => [r.employee_id, Number(r.est_hours) || 0]));
  const autoBonus = await roleAutoBonusMap(config);

  return employees.map((e) => {
    const events: WeekEvents = {
      positives: forEmp(positives, e.id),
      strikes: forEmp(strikes, e.id),
      writeUps: forEmp(writeUps, e.id),
    };
    const hours = hoursByEmployee.get(e.id) ?? 0;
    const baseMultiplier = e.base_multiplier != null ? Number(e.base_multiplier) : undefined;
    const result = computeWeek(events, hours, config, {
      autoBonus: autoBonus.get(e.id) ?? 0,
      baseMultiplier,
    });
    const estHours = estByEmployee.get(e.id) ?? 0;
    const estBonus = round2(estHours * config.baseRate * result.multiplier);
    return { employeeId: e.id, name: e.name, events, result, estHours, estBonus };
  });
}

export interface EstimatedWeekBonus {
  weekStart: string;
  estHours: number;
  multiplier: number;
  estBonus: number;
  hasStrike: boolean;
}

/**
 * One employee's projected bonus for a week from the ESTIMATED hours of the jobs
 * they're assigned to (before the payroll import lands): estHours × baseRate ×
 * this week's multiplier.
 */
export async function getEstimatedWeekBonus(
  employeeId: string,
  weekStart: string
): Promise<EstimatedWeekBonus> {
  const [config, week, row] = await Promise.all([
    getBonusConfig(),
    getEmployeeWeek(employeeId, weekStart),
    queryOne<{ est: number }>(
      `SELECT COALESCE(SUM(j.estimated_hours), 0)::float8 AS est
         FROM jobs j
        WHERE $1 = ANY(j.crew_ids) AND j.date >= $2 AND j.date <= $2::date + 6`,
      [employeeId, weekStart]
    ),
  ]);
  const estHours = Number(row?.est) || 0;
  const estBonus = round2(estHours * config.baseRate * week.result.multiplier);
  return {
    weekStart,
    estHours,
    multiplier: week.result.multiplier,
    estBonus,
    hasStrike: week.result.hasStrike,
  };
}

export interface JobCrewOption {
  id: string;
  date: string;
  jobNumber: string | null;
  customer: string | null;
  startTime: string | null;
  crew: { id: string; name: string; role?: string }[];
}

/**
 * Every job on a given date with its crew (auto-populated), for the group-event
 * picker. Includes jobs with no crew so a missed-sync roster can be corrected by
 * adding members. Any date, past or future.
 */
export async function getJobsByDate(date: string): Promise<JobCrewOption[]> {
  const rows = await query<{
    id: string;
    date: string;
    job_number: string | null;
    customer_name: string | null;
    start_time: string | null;
    crew: { id: string; name: string; role: string }[] | null;
  }>(
    `SELECT j.id, j.date::text, j.job_number, j.customer_name, j.start_time,
            COALESCE((
              SELECT json_agg(json_build_object('id', e.id, 'name', e.name, 'role', e.role) ORDER BY e.name)
                FROM employees e WHERE e.id = ANY(j.crew_ids)
            ), '[]'::json) AS crew
       FROM jobs j
      WHERE j.date = $1
      ORDER BY j.start_time, j.customer_name`,
    [date]
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    jobNumber: r.job_number,
    customer: r.customer_name,
    startTime: r.start_time,
    crew: r.crew ?? [],
  }));
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
  baseMultiplier: number; // effective base for this employee (override ?? default)
  hasPayroll: boolean;
  positives: (PositiveRow & { label: string })[];
  strikes: (StrikeRow & { label: string })[];
  writeUps: WriteUpRow[];
  roleBonuses: RoleBonus[]; // Driver / 2-Truck Lead add-ons from skills
  config: BonusConfig;
}

/** One employee's computed week + their events (with labels), for the crew card. */
export async function getEmployeeWeek(employeeId: string, weekStart: string): Promise<EmployeeWeek> {
  const config = await getBonusConfig();
  const baseMultiplier = await employeeBaseMultiplier(employeeId, config);
  const [positives, strikes, writeUps, hoursInfo] = await Promise.all([
    query<PositiveRow>(
      `SELECT id, type, event_date::text, note, job_id, discretionary FROM bonus_positives
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
  const roleBonuses = await roleAutoBonusDetailFor(employeeId, config);
  const result = computeWeek(events, hoursInfo.hours, config, {
    autoBonus: roleBonuses.reduce((s, r) => s + r.amount, 0),
    baseMultiplier,
  });

  return {
    weekStart,
    result,
    baseMultiplier,
    hasPayroll: hoursInfo.hasPayroll,
    positives: positives.map((p) => ({ ...p, label: positiveLabel(p.type) })),
    strikes: strikes.map((s) => ({ ...s, label: strikeLabel(s.type) })),
    writeUps,
    roleBonuses,
    config,
  };
}

/** Effective base multiplier for an employee: their override, else the company default. */
async function employeeBaseMultiplier(employeeId: string, config: BonusConfig): Promise<number> {
  const row = await queryOne<{ base_multiplier: number | null }>(
    'SELECT base_multiplier FROM employees WHERE id = $1',
    [employeeId]
  );
  return row?.base_multiplier != null ? Number(row.base_multiplier) : config.baseMultiplier;
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

  const autoBonus = await roleAutoBonusFor(employeeId, config);
  const baseMultiplier = await employeeBaseMultiplier(employeeId, config);
  const weekStarts = weeks.map((w) => w.week_start);
  const [positives, strikes, writeUps] = await Promise.all([
    query<PositiveRow & { week_start: string }>(
      `SELECT id, type, event_date::text, note, job_id, discretionary, week_start::text FROM bonus_positives
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
    const r = computeWeek(events, hours, config, { autoBonus, baseMultiplier });
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

// ── Unified event feed (one employee) ─────────────────────────

export interface EmployeeEvent {
  id: string;
  kind: 'positive' | 'gg_point' | 'strike' | 'writeup';
  label: string;
  date: string; // job / occurrence date
  effectiveDate: string; // record date (drives the pay period)
  arrivalTime: string | null; // set for Late strikes
  weekStart: string;
  note: string | null;
  voided: boolean;
  effect: string;
}

/** Every bonus/performance event for one employee, newest first — the record. */
export async function getEmployeeEvents(employeeId: string, limit = 100): Promise<EmployeeEvent[]> {
  const [positives, strikes, writeUps] = await Promise.all([
    query<{ id: string; type: string; event_date: string; effective_date: string; week_start: string; note: string | null; discretionary: boolean }>(
      `SELECT id, type, event_date::text, effective_date::text, week_start::text, note, discretionary
         FROM bonus_positives WHERE employee_id = $1`,
      [employeeId]
    ),
    query<{ id: string; type: string; event_date: string; effective_date: string; arrival_time: string | null; week_start: string; note: string | null; voided: boolean; void_reason: string | null }>(
      `SELECT id, type, event_date::text, effective_date::text, arrival_time::text, week_start::text, note, voided, void_reason
         FROM bonus_strikes WHERE employee_id = $1`,
      [employeeId]
    ),
    query<{ id: string; event_date: string; effective_date: string; week_start: string; summary: string; source: string }>(
      `SELECT id, event_date::text, effective_date::text, week_start::text, summary, source FROM write_ups WHERE employee_id = $1`,
      [employeeId]
    ),
  ]);

  const events: EmployeeEvent[] = [];
  for (const p of positives) {
    const gg = p.discretionary;
    events.push({
      id: p.id,
      kind: gg ? 'gg_point' : 'positive',
      label: positiveLabel(p.type),
      date: p.event_date,
      effectiveDate: p.effective_date,
      arrivalTime: null,
      weekStart: p.week_start,
      note: p.note,
      voided: false,
      effect: gg ? 'GG Point +0.5× (strike-proof)' : '+0.5×',
    });
  }
  for (const s of strikes) {
    events.push({
      id: s.id,
      kind: 'strike',
      label: strikeLabel(s.type),
      date: s.event_date,
      effectiveDate: s.effective_date,
      arrivalTime: s.arrival_time,
      weekStart: s.week_start,
      note: s.voided && s.void_reason ? `Voided: ${s.void_reason}` : s.note,
      voided: s.voided,
      effect: s.voided ? 'Voided' : 'Strike — forfeits bonus',
    });
  }
  for (const w of writeUps) {
    const auto = w.source === 'auto';
    events.push({
      id: w.id,
      kind: 'writeup',
      label: auto ? 'Write-Up (auto)' : 'Write-Up',
      date: w.event_date,
      effectiveDate: w.effective_date,
      arrivalTime: null,
      weekStart: w.week_start,
      note: w.summary,
      voided: false,
      effect: auto ? 'Write-up — 3 strikes in the week' : 'Write-up',
    });
  }
  events.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.date.localeCompare(a.date));
  return events.slice(0, limit);
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
