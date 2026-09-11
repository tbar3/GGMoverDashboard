import { addDays, format } from 'date-fns';
import { query, queryOne } from '@/lib/db';
import { getWeekBoard } from '@/lib/bonus';
import type { AdpW2Row, Adp1099Row } from '@/lib/payroll-compute';

/**
 * Read model for the Payroll Run. Combines, per employee for the week:
 *  - imported base values (payroll_entries: billable + computed warehouse, rate, tips,
 *    commissions from the SmartMoving report),
 *  - marketing hours (marketing_hours table — entered via the marketing form),
 *  - the weekly bonus (bonus engine),
 *  - manual overrides (payroll_overrides — corrections applied before ADP entry).
 * Then it recomputes total/OT and splits employees into the two ADP tables.
 *
 * Overrides and marketing are separate rows (not in payroll_entries) so re-importing
 * the report never clobbers a correction.
 */

export interface PayrollRunWeek {
  weekStart: string;
  periodStart: string | null;
  periodEnd: string | null;
}

/** Editable per-employee detail behind the ADP tables (for the corrections UI). */
export interface PayrollDetailRow {
  employeeId: string;
  name: string;
  classification: string | null;
  billableHours: number; // from the report (read-only)
  warehouseHours: number; // effective (override ?? computed)
  marketingHours: number; // from marketing_hours
  rate: number;
  /** Gross annual salary, or null for hourly staff. Set => salaried and exempt. */
  annualSalary: number | null;
  /** annual_salary / 52 — the week's base pay for salaried staff, else 0. */
  weeklySalary: number;
  tips: number; // effective
  commissions: number; // effective
  bonus: number; // effective (override ?? engine)
  computedBonus: number; // what the bonus engine says
  bonusSource: 'locked' | 'live' | 'override' | 'none';
  miles: number; // effective
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  totalCompensation: number; // base (hours×rate) + OT premium + tips + commissions + bonus + miles
  // Which fields are currently overridden (raw override value, or null).
  ov: {
    warehouse: number | null;
    tips: number | null;
    commissions: number | null;
    bonus: number | null;
    miles: number | null;
  };
}

export interface PayrollRun {
  weekStart: string;
  periodStart: string | null;
  periodEnd: string | null;
  w2: AdpW2Row[];
  contractors1099: Adp1099Row[];
  detail: PayrollDetailRow[];
  audit: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

// ── Week business summary (jobs / revenue / payroll gross / labor ratio) ───────

export interface WeekSummary {
  weekStart: string;
  jobs: number | null;
  revenue: number | null;
  payrollGross: number; // effective (entered override, else computed from the run)
  computedGross: number; // the run's computed gross_pay sum
  grossIsOverride: boolean;
  laborRatio: number | null; // payrollGross / revenue
  prior: {
    jobs: number | null;
    revenue: number | null;
    payrollGross: number | null;
    laborRatio: number | null;
  };
}

async function grossFor(weekStart: string): Promise<number> {
  const r = await queryOne<{ g: number }>(
    'SELECT COALESCE(SUM(gross_pay), 0) AS g FROM payroll_entries WHERE week_start = $1',
    [weekStart]
  );
  return Number(r?.g ?? 0);
}

export async function getWeekSummary(weekStart: string): Promise<WeekSummary> {
  const prior = format(addDays(new Date(`${weekStart}T12:00:00`), -7), 'yyyy-MM-dd');
  type Row = { jobs: number | null; revenue: number | null; payroll_gross: number | null };
  const [computedGross, computedGrossPrior, s, sp] = await Promise.all([
    grossFor(weekStart),
    grossFor(prior),
    queryOne<Row>(
      'SELECT jobs, revenue, payroll_gross FROM payroll_week_summary WHERE week_start = $1',
      [weekStart]
    ),
    queryOne<Row>(
      'SELECT jobs, revenue, payroll_gross FROM payroll_week_summary WHERE week_start = $1',
      [prior]
    ),
  ]);

  const payrollGross = s?.payroll_gross != null ? Number(s.payroll_gross) : computedGross;
  const priorGross = sp?.payroll_gross != null ? Number(sp.payroll_gross) : computedGrossPrior;
  const revenue = s?.revenue != null ? Number(s.revenue) : null;
  const priorRevenue = sp?.revenue != null ? Number(sp.revenue) : null;
  const hasPriorGross = sp?.payroll_gross != null || computedGrossPrior > 0;

  return {
    weekStart,
    jobs: s?.jobs ?? null,
    revenue,
    payrollGross,
    computedGross,
    grossIsOverride: s?.payroll_gross != null,
    laborRatio: revenue && revenue > 0 ? payrollGross / revenue : null,
    prior: {
      jobs: sp?.jobs ?? null,
      revenue: priorRevenue,
      payrollGross: hasPriorGross ? priorGross : null,
      laborRatio: priorRevenue && priorRevenue > 0 ? priorGross / priorRevenue : null,
    },
  };
}

export interface WeeklyTrendPoint {
  weekStart: string;
  weekLabel: string;
  jobs: number | null;
  revenue: number | null;
  payrollGross: number | null;
  laborRatio: number | null; // percent
}

/** The last `limit` weeks of business metrics for the dashboard trend charts,
 *  oldest → newest. Revenue/jobs come from payroll_week_summary; payroll gross is
 *  the entered override or the run's computed gross. */
export async function getWeeklyTrends(limit = 12): Promise<WeeklyTrendPoint[]> {
  const weeks = await query<{ w: string }>(
    `SELECT week_start::text AS w FROM (
        SELECT week_start FROM payroll_week_summary
        UNION SELECT week_start FROM payroll_entries
     ) u GROUP BY week_start ORDER BY week_start DESC LIMIT $1`,
    [limit]
  );
  if (weeks.length === 0) return [];
  const list = weeks.map((r) => r.w);

  const [summaries, gross] = await Promise.all([
    query<{ week_start: string; jobs: number | null; revenue: number | null; payroll_gross: number | null }>(
      'SELECT week_start::text, jobs, revenue, payroll_gross FROM payroll_week_summary WHERE week_start = ANY($1)',
      [list]
    ),
    query<{ week_start: string; g: number }>(
      'SELECT week_start::text, COALESCE(SUM(gross_pay), 0) AS g FROM payroll_entries WHERE week_start = ANY($1) GROUP BY week_start',
      [list]
    ),
  ]);
  const sumBy = new Map(summaries.map((s) => [s.week_start, s]));
  const grossBy = new Map(gross.map((g) => [g.week_start, Number(g.g)]));

  return list
    .slice()
    .sort() // ascending (oldest → newest)
    .map((w) => {
      const s = sumBy.get(w);
      const computed = grossBy.get(w) ?? 0;
      const payrollGross = s?.payroll_gross != null ? Number(s.payroll_gross) : computed || null;
      const revenue = s?.revenue != null ? Number(s.revenue) : null;
      return {
        weekStart: w,
        weekLabel: format(new Date(`${w}T12:00:00`), 'MMM d'),
        jobs: s?.jobs ?? null,
        revenue,
        payrollGross,
        laborRatio: revenue && revenue > 0 && payrollGross != null ? (payrollGross / revenue) * 100 : null,
      };
    });
}

/** Weeks that have imported payroll data, newest first. */
export async function getPayrollRunWeeks(): Promise<PayrollRunWeek[]> {
  return query<PayrollRunWeek>(
    `SELECT week_start::text AS "weekStart",
            MIN(period_start)::text AS "periodStart",
            MAX(period_end)::text AS "periodEnd"
       FROM payroll_entries
      GROUP BY week_start
      ORDER BY week_start DESC
      LIMIT 16`
  );
}

interface BaseRow {
  employee_id: string;
  name: string;
  classification: string | null;
  is_active: boolean;
  billable_hours: number | null;
  warehouse_hours: number | null;
  hourly_rate: number | null;
  annual_salary: number | null;
  tip: number | null;
  commissions: number | null;
  miles: number | null;
  period_start: string | null;
  period_end: string | null;
}
interface OverrideRow {
  employee_id: string;
  warehouse_hours: number | null;
  tips: number | null;
  commissions: number | null;
  bonus: number | null;
  miles: number | null;
}

export type BonusSource = 'locked' | 'live';

export interface WeekBonus {
  byEmployee: Map<string, number>;
  /** 'locked' once the bonus week is approved; 'live' while it is still open. */
  source: BonusSource;
  bonusWeekStatus: string | null;
}

/**
 * The weekly bonus, per employee, for payroll purposes.
 *
 * This is the difference between a payroll figure that holds still and one that
 * does not. Approving a bonus week snapshots every result into
 * bonus_week_results; before that, getWeekBoard() recomputes from live strikes,
 * positives and hours on every call.
 *
 * Payroll previously always used the live board. That meant voiding a strike or
 * re-importing hours weeks later silently changed what a past payroll run said it
 * had paid. Once the week is approved we read the snapshot instead, so the number
 * payroll uses is the same number that was approved — permanently.
 */
export async function getWeekBonus(weekStart: string): Promise<WeekBonus> {
  const week = await queryOne<{ status: string }>(
    'SELECT status FROM bonus_weeks WHERE week_start = $1',
    [weekStart]
  );

  if (week?.status === 'approved') {
    const locked = await query<{ employee_id: string; bonus: number | null }>(
      'SELECT employee_id, bonus FROM bonus_week_results WHERE week_start = $1',
      [weekStart]
    );
    return {
      byEmployee: new Map(locked.map((r) => [r.employee_id, num(r.bonus)])),
      source: 'locked',
      bonusWeekStatus: week.status,
    };
  }

  const board = await getWeekBoard(weekStart);
  return {
    byEmployee: new Map(board.map((b) => [b.employeeId, b.result.bonus])),
    source: 'live',
    bonusWeekStatus: week?.status ?? null,
  };
}

/**
 * Recompute the week from current data. This is what an OPEN week shows, and what
 * closing a week snapshots. Callers that just want "the run" should use
 * getPayrollRun(), which returns the frozen snapshot once a week is closed.
 */
export async function computePayrollRun(weekStart: string): Promise<PayrollRun> {
  const weekEnd = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  const [entries, weekBonus, overrides, marketing, mileage] = await Promise.all([
    query<BaseRow>(
      `SELECT pe.employee_id, e.name, e.classification, e.is_active, e.annual_salary,
              pe.billable_hours, pe.warehouse_hours, pe.hourly_rate, pe.tip, pe.commissions, pe.miles,
              pe.period_start::text, pe.period_end::text
         FROM payroll_entries pe
         JOIN employees e ON e.id = pe.employee_id
        WHERE pe.week_start = $1
        ORDER BY e.name`,
      [weekStart]
    ),
    getWeekBonus(weekStart),
    query<OverrideRow>(
      `SELECT employee_id, warehouse_hours, tips, commissions, bonus, miles
         FROM payroll_overrides WHERE week_start = $1`,
      [weekStart]
    ),
    query<{ employee_id: string; hours: number }>(
      `SELECT employee_id, hours FROM marketing_hours WHERE week_start = $1`,
      [weekStart]
    ),
    // Mileage $ for the week comes from the Mileage module ($0.76/mi entries).
    query<{ employee_id: string; amount: number }>(
      `SELECT employee_id, COALESCE(SUM(amount), 0) AS amount
         FROM mileage_entries WHERE date >= $1 AND date <= $2
        GROUP BY employee_id`,
      [weekStart, weekEnd]
    ),
  ]);

  const bonusByEmp = weekBonus.byEmployee;
  const ovByEmp = new Map(overrides.map((o) => [o.employee_id, o]));
  const mktByEmp = new Map(marketing.map((m) => [m.employee_id, num(m.hours)]));
  const milesByEmp = new Map(mileage.map((m) => [m.employee_id, num(m.amount)]));

  const w2: AdpW2Row[] = [];
  const contractors1099: Adp1099Row[] = [];
  const detail: PayrollDetailRow[] = [];
  const audit: string[] = [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  for (const e of entries) {
    periodStart = periodStart ?? e.period_start;
    periodEnd = periodEnd ?? e.period_end;

    const ov = ovByEmp.get(e.employee_id);
    const billable = num(e.billable_hours);
    const warehouse = ov?.warehouse_hours != null ? num(ov.warehouse_hours) : num(e.warehouse_hours);
    const marketingHours = mktByEmp.get(e.employee_id) ?? 0;
    const rate = num(e.hourly_rate);
    const tips = ov?.tips != null ? num(ov.tips) : num(e.tip);
    const commissions = ov?.commissions != null ? num(ov.commissions) : num(e.commissions);
    const computedBonus = round2(bonusByEmp.get(e.employee_id) ?? 0);
    const overridden = ov?.bonus != null;
    const bonus = overridden ? num(ov.bonus) : computedBonus;
    const bonusSource: PayrollDetailRow['bonusSource'] = overridden
      ? 'override'
      : bonusByEmp.has(e.employee_id)
        ? weekBonus.source
        : 'none';
    const miles = ov?.miles != null ? num(ov.miles) : (milesByEmp.get(e.employee_id) ?? 0);

    // Salaried staff (annual_salary set) are exempt: their week is annual/52 whatever
    // the hours, and no overtime premium accrues. Hours are still totalled because the
    // weekly bonus is driven by them. Hourly staff are computed exactly as before.
    const annualSalary = e.annual_salary != null ? num(e.annual_salary) : null;
    const salaried = annualSalary != null;
    const weeklySalary = salaried ? round2(annualSalary / 52) : 0;

    const total = round2(billable + warehouse + marketingHours);
    const ot = salaried ? 0 : round2(Math.max(0, total - 40));
    const reg = round2(total - ot);
    // Actual pay: salary for exempt staff, else all hours at the standard rate plus
    // the OT half-premium; earnings are added the same way for both.
    const basePay = salaried ? weeklySalary : round2(total * rate + ot * (rate / 2));
    const totalCompensation = round2(basePay + tips + commissions + bonus + miles);

    // Audit (surface, don't block).
    if (e.is_active && !e.classification) audit.push(`${e.name}: no W-2/1099 classification — not in either ADP table`);
    if (total > 80) audit.push(`${e.name}: ${total} hours > 80`);
    if (rate === 0 && !salaried) audit.push(`${e.name}: $0 hourly rate`);

    detail.push({
      employeeId: e.employee_id,
      name: e.name,
      classification: e.classification,
      billableHours: billable,
      warehouseHours: warehouse,
      marketingHours,
      rate,
      annualSalary,
      weeklySalary,
      tips,
      commissions,
      bonus,
      computedBonus,
      bonusSource,
      miles,
      totalHours: total,
      regularHours: reg,
      overtimeHours: ot,
      totalCompensation,
      ov: {
        warehouse: ov?.warehouse_hours != null ? num(ov.warehouse_hours) : null,
        tips: ov?.tips != null ? num(ov.tips) : null,
        commissions: ov?.commissions != null ? num(ov.commissions) : null,
        bonus: ov?.bonus != null ? num(ov.bonus) : null,
        miles: ov?.miles != null ? num(ov.miles) : null,
      },
    });

    if (e.classification === 'W-2') {
      // ADP already carries the salary and auto-pays it, so a salaried person's hours
      // columns stay empty — keying them would pay the hours on top of the salary.
      w2.push({
        employee: e.name,
        regularHours: salaried ? 0 : reg,
        overtimeHours: salaried ? 0 : ot,
        tips,
        bonus: round2(bonus),
        commissions,
        reimbursement: miles,
      });
    } else if (e.classification === '1099') {
      contractors1099.push({ contractor: e.name, compHours: round2(total + ot / 2), compAmount: round2(tips + commissions + bonus), reimbursement: miles });
    }
  }

  return { weekStart, periodStart, periodEnd, w2, contractors1099, detail, audit };
}


// ── Closed runs ──────────────────────────────────────────────────────────────

export interface ClosedRunMeta {
  id: string;
  weekStart: string;
  version: number;
  periodStart: string | null;
  periodEnd: string | null;
  payDate: string | null;
  grossPayroll: number;
  bonusTotal: number;
  reimbursementTotal: number;
  totalHours: number;
  headcount: number;
  revenue: number | null;
  laborRatio: number | null;
  bonusWeekStatus: string | null;
  closedAt: string;
  closedByName: string;
  note: string | null;
}

/** The run currently in force for a week, or null if the week is open. */
export async function getClosedRun(weekStart: string): Promise<ClosedRunMeta | null> {
  const r = await queryOne<{
    id: string; week_start: string; version: number;
    period_start: string | null; period_end: string | null; pay_date: string | null;
    gross_payroll: number; bonus_total: number; reimbursement_total: number;
    total_hours: number; headcount: number; revenue: number | null; labor_ratio: number | null;
    bonus_week_status: string | null; closed_at: string; closed_by_name: string; note: string | null;
  }>(
    `SELECT id, week_start::text, version, period_start::text, period_end::text,
            pay_date::text, gross_payroll, bonus_total, reimbursement_total,
            total_hours, headcount, revenue, labor_ratio, bonus_week_status,
            closed_at::text, closed_by_name, note
       FROM payroll_runs
      WHERE week_start = $1 AND reopened_at IS NULL`,
    [weekStart]
  );
  if (!r) return null;
  return {
    id: r.id,
    weekStart: r.week_start,
    version: r.version,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    payDate: r.pay_date,
    grossPayroll: num(r.gross_payroll),
    bonusTotal: num(r.bonus_total),
    reimbursementTotal: num(r.reimbursement_total),
    totalHours: num(r.total_hours),
    headcount: r.headcount,
    revenue: r.revenue != null ? num(r.revenue) : null,
    laborRatio: r.labor_ratio != null ? num(r.labor_ratio) : null,
    bonusWeekStatus: r.bonus_week_status,
    closedAt: r.closed_at,
    closedByName: r.closed_by_name,
    note: r.note,
  };
}

interface LineRow {
  employee_id: string | null;
  employee_name: string;
  classification: string | null;
  billable_hours: number; warehouse_hours: number; marketing_hours: number;
  total_hours: number; regular_hours: number; overtime_hours: number;
  hourly_rate: number | null; weekly_salary: number | null;
  base_pay: number; overtime_pay: number; tips: number; commissions: number;
  bonus: number; mileage_amount: number; total_compensation: number;
  bonus_source: PayrollDetailRow['bonusSource'];
}

/**
 * Rebuild a PayrollRun from a closed run's frozen lines.
 *
 * Deliberately reads only payroll_run_lines — it does not consult payroll_entries,
 * the bonus board, or the overrides table. That is the entire point: a closed week
 * must render the same way in six months as it did the day it was paid, whatever
 * has happened to the inputs since.
 */
async function hydrateClosedRun(meta: ClosedRunMeta): Promise<PayrollRun> {
  const lines = await query<LineRow>(
    `SELECT employee_id, employee_name, classification, billable_hours, warehouse_hours,
            marketing_hours, total_hours, regular_hours, overtime_hours, hourly_rate,
            weekly_salary, base_pay, overtime_pay, tips, commissions, bonus,
            mileage_amount, total_compensation, bonus_source
       FROM payroll_run_lines WHERE run_id = $1 ORDER BY employee_name`,
    [meta.id]
  );

  const detail: PayrollDetailRow[] = [];
  const w2: AdpW2Row[] = [];
  const contractors1099: Adp1099Row[] = [];

  for (const l of lines) {
    const salaried = l.weekly_salary != null && num(l.weekly_salary) > 0;
    detail.push({
      employeeId: l.employee_id ?? '',
      name: l.employee_name,
      classification: l.classification,
      billableHours: num(l.billable_hours),
      warehouseHours: num(l.warehouse_hours),
      marketingHours: num(l.marketing_hours),
      rate: num(l.hourly_rate),
      annualSalary: salaried ? round2(num(l.weekly_salary) * 52) : null,
      weeklySalary: num(l.weekly_salary),
      tips: num(l.tips),
      commissions: num(l.commissions),
      bonus: num(l.bonus),
      computedBonus: num(l.bonus),
      bonusSource: l.bonus_source,
      miles: num(l.mileage_amount),
      totalHours: num(l.total_hours),
      regularHours: num(l.regular_hours),
      overtimeHours: num(l.overtime_hours),
      totalCompensation: num(l.total_compensation),
      // A closed line IS the decision; there is no longer a pending override to show.
      ov: { warehouse: null, tips: null, commissions: null, bonus: null, miles: null },
    });

    if (l.classification === 'W-2') {
      w2.push({
        employee: l.employee_name,
        regularHours: salaried ? 0 : num(l.regular_hours),
        overtimeHours: salaried ? 0 : num(l.overtime_hours),
        tips: num(l.tips),
        bonus: num(l.bonus),
        commissions: num(l.commissions),
        reimbursement: num(l.mileage_amount),
      });
    } else if (l.classification === '1099') {
      contractors1099.push({
        contractor: l.employee_name,
        compHours: round2(num(l.total_hours) + num(l.overtime_hours) / 2),
        compAmount: round2(num(l.tips) + num(l.commissions) + num(l.bonus)),
        reimbursement: num(l.mileage_amount),
      });
    }
  }

  return {
    weekStart: meta.weekStart,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    w2,
    contractors1099,
    detail,
    // Audit warnings described the inputs at close time and would be misleading
    // replayed against today's data; the closed banner carries the useful facts.
    audit: [],
  };
}

/**
 * The run for a week: the frozen snapshot if it is closed, otherwise a live
 * recomputation. Every consumer — the page, the exports, the audit — goes through
 * here, so none of them can accidentally show live numbers for a paid week.
 */
export async function getPayrollRun(weekStart: string): Promise<PayrollRun> {
  const closed = await getClosedRun(weekStart);
  return closed ? hydrateClosedRun(closed) : computePayrollRun(weekStart);
}
