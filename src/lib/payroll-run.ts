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
  tips: number; // effective
  commissions: number; // effective
  bonus: number; // effective (override ?? engine)
  computedBonus: number; // what the bonus engine says
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

export async function getPayrollRun(weekStart: string): Promise<PayrollRun> {
  const weekEnd = format(addDays(new Date(`${weekStart}T12:00:00`), 6), 'yyyy-MM-dd');
  const [entries, board, overrides, marketing, mileage] = await Promise.all([
    query<BaseRow>(
      `SELECT pe.employee_id, e.name, e.classification, e.is_active,
              pe.billable_hours, pe.warehouse_hours, pe.hourly_rate, pe.tip, pe.commissions, pe.miles,
              pe.period_start::text, pe.period_end::text
         FROM payroll_entries pe
         JOIN employees e ON e.id = pe.employee_id
        WHERE pe.week_start = $1
        ORDER BY e.name`,
      [weekStart]
    ),
    getWeekBoard(weekStart),
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

  const bonusByEmp = new Map(board.map((b) => [b.employeeId, b.result.bonus]));
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
    const bonus = ov?.bonus != null ? num(ov.bonus) : computedBonus;
    const miles = ov?.miles != null ? num(ov.miles) : (milesByEmp.get(e.employee_id) ?? 0);

    const total = round2(billable + warehouse + marketingHours);
    const ot = round2(Math.max(0, total - 40));
    const reg = round2(total - ot);
    // Actual pay: all hours at the standard rate + the OT half-premium + earnings.
    const totalCompensation = round2(total * rate + ot * (rate / 2) + tips + commissions + bonus + miles);

    // Audit (surface, don't block).
    if (e.is_active && !e.classification) audit.push(`${e.name}: no W-2/1099 classification — not in either ADP table`);
    if (total > 80) audit.push(`${e.name}: ${total} hours > 80`);
    if (rate === 0) audit.push(`${e.name}: $0 hourly rate`);

    detail.push({
      employeeId: e.employee_id,
      name: e.name,
      classification: e.classification,
      billableHours: billable,
      warehouseHours: warehouse,
      marketingHours,
      rate,
      tips,
      commissions,
      bonus,
      computedBonus,
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
      w2.push({ employee: e.name, regularHours: reg, overtimeHours: ot, tips, bonus: round2(bonus), commissions, reimbursement: miles });
    } else if (e.classification === '1099') {
      contractors1099.push({ contractor: e.name, compHours: round2(total + ot / 2), compAmount: round2(tips + commissions + bonus), reimbursement: miles });
    }
  }

  return { weekStart, periodStart, periodEnd, w2, contractors1099, detail, audit };
}
