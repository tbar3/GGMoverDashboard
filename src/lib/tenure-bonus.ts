import { queryOne, query } from '@/lib/db';
import { differenceInMonths } from 'date-fns';

// Bi-annual, strictly tenure-based bonus pool.
//   Pool  = 1% of ESTIMATED revenue for jobs in the half-year
//   Net   = Pool − damages in the period (unreported damages count 2x, the
//           standard penalty — this pool is where damages come out of)
//   Split = proportional to each active employee's months worked (the only
//           factor). 1 month = 1 share.
// Periods are calendar halves: H1 = Jan–Jun, H2 = Jul–Dec.

const POOL_PCT = 0.01;

export interface TenureRow {
  id: string;
  name: string;
  months: number;
  sharePct: number;
  payout: number;
}

export interface TenureBonus {
  year: number;
  half: 1 | 2;
  label: string;
  periodStart: string;
  periodEnd: string;
  estimatedRevenue: number;
  grossPool: number;
  damages: number;
  netPool: number;
  totalMonths: number;
  rows: TenureRow[];
}

/** The half-year that a date falls in. */
export function currentPeriod(now: Date): { year: number; half: 1 | 2 } {
  return { year: now.getFullYear(), half: now.getMonth() < 6 ? 1 : 2 };
}

export async function getTenureBonus(year: number, half: 1 | 2): Promise<TenureBonus> {
  const periodStart = half === 1 ? `${year}-01-01` : `${year}-07-01`;
  const periodEnd = half === 1 ? `${year}-06-30` : `${year}-12-31`;
  const label = `${half === 1 ? 'Jan–Jun' : 'Jul–Dec'} ${year}`;

  // Tenure is measured as of the period end, or today for a period still open.
  const today = new Date();
  const endDate = new Date(periodEnd);
  const asOf = endDate < today ? endDate : today;

  const [revRow, dmgRow, employees] = await Promise.all([
    queryOne<{ rev: number }>(
      `SELECT COALESCE(SUM(total_estimated_cost), 0)::float8 AS rev
         FROM smartmoving_jobs
        WHERE job_date >= $1 AND job_date <= $2
          AND opportunity_status NOT IN ('Lost', 'Bad lead', 'Cancelled')`,
      [periodStart, periodEnd]
    ),
    queryOne<{ dmg: number }>(
      `SELECT COALESCE(SUM(CASE WHEN was_reported THEN amount ELSE amount * 2 END), 0)::float8 AS dmg
         FROM damages WHERE created_at >= $1 AND created_at <= ($2::date + 1)`,
      [periodStart, periodEnd]
    ),
    query<{ id: string; name: string; start_date: string }>(
      'SELECT id, name, start_date FROM employees WHERE is_active = TRUE'
    ),
  ]);

  const estimatedRevenue = revRow?.rev ?? 0;
  const grossPool = estimatedRevenue * POOL_PCT;
  const damages = dmgRow?.dmg ?? 0;
  const netPool = Math.max(0, grossPool - damages);

  const withMonths = employees.map((e) => ({
    id: e.id,
    name: e.name,
    months: Math.max(0, differenceInMonths(asOf, new Date(e.start_date))),
  }));
  const totalMonths = withMonths.reduce((s, e) => s + e.months, 0);

  const rows: TenureRow[] = withMonths
    .map((e) => {
      const sharePct = totalMonths > 0 ? (e.months / totalMonths) * 100 : 0;
      const payout = totalMonths > 0 ? (e.months / totalMonths) * netPool : 0;
      return { ...e, sharePct, payout };
    })
    .sort((a, b) => b.months - a.months);

  return {
    year,
    half,
    label,
    periodStart,
    periodEnd,
    estimatedRevenue,
    grossPool,
    damages,
    netPool,
    totalMonths,
    rows,
  };
}
