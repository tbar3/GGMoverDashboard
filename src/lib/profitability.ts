import { query, queryOne } from '@/lib/db';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';

/**
 * Profitability / P&L.
 *
 * Revenue + materials come from the SmartMoving report (per-job actuals). Labor is
 * the REAL wage cost from imported payroll (payroll_entries.gross_pay) — NOT
 * SmartMoving's actual_labor_cost, which is the labor line billed to the customer.
 * Overhead, debt service, and owner/admin salaries are entered by hand each month
 * (operating_costs). QuickBooks can replace those manual inputs later.
 */

const REAL_JOB = "opportunity_status NOT IN ('Lost', 'Bad lead', 'Cancelled')";

export interface PnL {
  year: number;
  month: number; // 1-12
  label: string;
  monthStart: string;
  monthEnd: string;
  jobCount: number;
  revenue: number;
  materialsCost: number;
  laborCost: number; // actual wages from payroll
  grossProfit: number;
  grossMargin: number; // %
  overhead: number;
  debt: number;
  salaries: number;
  otherCosts: number;
  operatingExpenses: number;
  netProfit: number;
  netMargin: number; // %
  payrollWeeks: number; // how many payroll weeks we have for the month (data-completeness hint)
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function monthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'MMMM yyyy');
}

export async function getMonthlyPnL(year: number, month: number): Promise<PnL> {
  const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(year, month, 0), 'yyyy-MM-dd'); // day 0 of next month = last day

  const [rev, labor, costs] = await Promise.all([
    queryOne<{ jobs: number; revenue: number; materials: number }>(
      `SELECT COUNT(*)::int AS jobs,
              COALESCE(SUM(total_actual_cost), 0)::float8 AS revenue,
              COALESCE(SUM(actual_materials_cost), 0)::float8 AS materials
         FROM smartmoving_jobs
        WHERE job_date >= $1 AND job_date <= $2 AND ${REAL_JOB}`,
      [monthStart, monthEnd]
    ),
    queryOne<{ labor: number; weeks: number }>(
      `SELECT COALESCE(SUM(gross_pay), 0)::float8 AS labor,
              COUNT(DISTINCT week_start)::int AS weeks
         FROM payroll_entries
        WHERE week_start >= $1 AND week_start <= $2`,
      [monthStart, monthEnd]
    ),
    query<{ category: string; total: number }>(
      `SELECT category, COALESCE(SUM(amount), 0)::float8 AS total
         FROM operating_costs WHERE period_month = $1 GROUP BY category`,
      [monthStart]
    ),
  ]);

  const byCat = new Map(costs.map((c) => [c.category, Number(c.total)]));
  const overhead = byCat.get('overhead') ?? 0;
  const debt = byCat.get('debt') ?? 0;
  const salaries = byCat.get('salary') ?? 0;
  const otherCosts = byCat.get('other') ?? 0;

  const revenue = rev?.revenue ?? 0;
  const materialsCost = rev?.materials ?? 0;
  const laborCost = labor?.labor ?? 0;
  const grossProfit = revenue - materialsCost - laborCost;
  const operatingExpenses = overhead + debt + salaries + otherCosts;
  const netProfit = grossProfit - operatingExpenses;

  return {
    year,
    month,
    label: monthLabel(year, month),
    monthStart,
    monthEnd,
    jobCount: rev?.jobs ?? 0,
    revenue,
    materialsCost,
    laborCost,
    grossProfit,
    grossMargin: pct(grossProfit, revenue),
    overhead,
    debt,
    salaries,
    otherCosts,
    operatingExpenses,
    netProfit,
    netMargin: pct(netProfit, revenue),
    payrollWeeks: labor?.weeks ?? 0,
  };
}

export interface CostLine {
  id: string;
  category: string;
  label: string;
  amount: number;
}

export async function getOperatingCosts(year: number, month: number): Promise<CostLine[]> {
  const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
  const rows = await query<{ id: string; category: string; label: string; amount: number }>(
    `SELECT id, category, label, amount FROM operating_costs
      WHERE period_month = $1 ORDER BY category, label`,
    [monthStart]
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export interface JobProfit {
  id: string;
  customer: string;
  jobNumber: string | null;
  date: string;
  revenue: number;
  materials: number;
  laborBilled: number; // SmartMoving's labor line (billed) — not wage cost
  grossExLabor: number; // revenue - materials
}

/** Per-job metrics for the month. Labor here is SmartMoving's billed line (per-job
 *  wage cost isn't available — payroll is weekly), so we surface revenue − materials
 *  as the reliable per-job margin and show billed labor for reference. */
export async function getJobProfitability(year: number, month: number): Promise<JobProfit[]> {
  const monthStart = format(new Date(year, month - 1, 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(year, month, 0), 'yyyy-MM-dd');
  const rows = await query<{
    id: string;
    customer_name: string | null;
    job_number: string | null;
    job_date: string;
    revenue: number;
    materials: number;
    labor: number;
  }>(
    `SELECT id, customer_name, job_number, job_date::text,
            COALESCE(total_actual_cost, 0)::float8 AS revenue,
            COALESCE(actual_materials_cost, 0)::float8 AS materials,
            COALESCE(actual_labor_cost, 0)::float8 AS labor
       FROM smartmoving_jobs
      WHERE job_date >= $1 AND job_date <= $2 AND ${REAL_JOB}
      ORDER BY revenue DESC`,
    [monthStart, monthEnd]
  );
  return rows.map((r) => ({
    id: r.id,
    customer: r.customer_name ?? '—',
    jobNumber: r.job_number,
    date: r.job_date,
    revenue: Number(r.revenue),
    materials: Number(r.materials),
    laborBilled: Number(r.labor),
    grossExLabor: Number(r.revenue) - Number(r.materials),
  }));
}

export interface WeekProfit {
  weekStart: string;
  weekEnd: string;
  revenue: number;
  materials: number;
  labor: number;
  gross: number;
}

/** Weekly revenue/materials (SmartMoving) + labor (payroll) for the month's weeks. */
export async function getWeeklyProfit(year: number, month: number): Promise<WeekProfit[]> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Build the set of ISO-week Mondays that overlap the month.
  const weeks: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(monthStart, { weekStartsOn: 1 });
  while (cursor <= monthEnd) {
    weeks.push({ start: cursor, end: endOfWeek(cursor, { weekStartsOn: 1 }) });
    cursor = addDays(cursor, 7);
  }

  const results: WeekProfit[] = [];
  for (const w of weeks) {
    const ws = format(w.start, 'yyyy-MM-dd');
    const we = format(w.end, 'yyyy-MM-dd');
    const [rev, labor] = await Promise.all([
      queryOne<{ revenue: number; materials: number }>(
        `SELECT COALESCE(SUM(total_actual_cost),0)::float8 AS revenue,
                COALESCE(SUM(actual_materials_cost),0)::float8 AS materials
           FROM smartmoving_jobs WHERE job_date >= $1 AND job_date <= $2 AND ${REAL_JOB}`,
        [ws, we]
      ),
      queryOne<{ labor: number }>(
        `SELECT COALESCE(SUM(gross_pay),0)::float8 AS labor
           FROM payroll_entries WHERE week_start = $1`,
        [ws]
      ),
    ]);
    const revenue = rev?.revenue ?? 0;
    const materials = rev?.materials ?? 0;
    const laborCost = labor?.labor ?? 0;
    results.push({
      weekStart: ws,
      weekEnd: we,
      revenue,
      materials,
      labor: laborCost,
      gross: revenue - materials - laborCost,
    });
  }
  return results;
}
