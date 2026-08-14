import { queryOne, query } from '@/lib/db';
import { differenceInDays } from 'date-fns';

// Bi-annual, strictly tenure-based bonus pool.
//   Pool  = 1% of revenue, ENTERED by the admin per payout (tenure_bonus_periods).
//   Net   = Pool − damages in the window (unreported damages count 2×, the standard
//           penalty — this pool is where damages come out of).
//   Split = strictly proportional to each active employee's total months of tenure
//           (1 month = 1 share; rounded to the nearest whole month), among employees
//           active on the payout date.
// Paid end of June and end of December, each on the trailing 6 months:
//   December payout → Jun 1–Nov 30 (same year)
//   June payout     → Dec 1 (prior year)–May 31

const DAYS_PER_MONTH = 30.4375;

export interface TenurePeriodMeta {
  payoutDate: string;
  windowStart: string;
  windowEnd: string;
  label: string;
}

export interface TenureRow {
  id: string;
  name: string;
  months: number; // shares
  sharePct: number;
  payout: number;
}

export interface TenureBonus extends TenurePeriodMeta {
  periodKey: string;
  poolAmount: number;
  damages: number;
  netPool: number;
  totalShares: number;
  rows: TenureRow[];
}

/** Window + payout date for a period key ('YYYY-06' | 'YYYY-12'). */
export function tenurePeriodMeta(periodKey: string): TenurePeriodMeta {
  const [y, m] = periodKey.split('-').map(Number);
  if (m === 12) {
    return {
      payoutDate: `${y}-12-31`,
      windowStart: `${y}-06-01`,
      windowEnd: `${y}-11-30`,
      label: `December ${y} (Jun–Nov ${y})`,
    };
  }
  return {
    payoutDate: `${y}-06-30`,
    windowStart: `${y - 1}-12-01`,
    windowEnd: `${y}-05-31`,
    label: `June ${y} (Dec ${y - 1}–May ${y})`,
  };
}

/** The next upcoming payout period key for a given date. */
export function upcomingTenurePeriodKey(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m <= 6 ? `${y}-06` : `${y}-12`;
}

export async function getTenureBonus(periodKey: string): Promise<TenureBonus> {
  const meta = tenurePeriodMeta(periodKey);

  const [periodRow, dmgRow, employees] = await Promise.all([
    queryOne<{ pool_amount: number }>(
      'SELECT pool_amount FROM tenure_bonus_periods WHERE period_key = $1',
      [periodKey]
    ),
    queryOne<{ dmg: number }>(
      `SELECT COALESCE(SUM(CASE WHEN was_reported THEN amount ELSE amount * 2 END), 0)::float8 AS dmg
         FROM damages WHERE created_at >= $1 AND created_at <= ($2::date + 1)`,
      [meta.windowStart, meta.windowEnd]
    ),
    // Crew/staff only — owners (and the system admin account) are excluded from the
    // tenure split.
    query<{ id: string; name: string; start_date: string }>(
      `SELECT id, name, start_date FROM employees
        WHERE is_active = TRUE AND role NOT IN ('owner', 'admin') AND start_date <= $1
        ORDER BY name`,
      [meta.payoutDate]
    ),
  ]);

  const poolAmount = Number(periodRow?.pool_amount ?? 0);
  const damages = dmgRow?.dmg ?? 0;
  const netPool = Math.max(0, poolAmount - damages);

  const payout = new Date(`${meta.payoutDate}T12:00:00`);
  const withMonths = employees.map((e) => {
    const days = differenceInDays(payout, new Date(`${e.start_date}T12:00:00`));
    const months = Math.max(0, Math.round(days / DAYS_PER_MONTH)); // nearest whole month
    return { id: e.id, name: e.name, months };
  });
  const totalShares = withMonths.reduce((s, e) => s + e.months, 0);

  const rows: TenureRow[] = withMonths
    .map((e) => ({
      ...e,
      sharePct: totalShares > 0 ? (e.months / totalShares) * 100 : 0,
      payout: totalShares > 0 ? Math.round(((e.months / totalShares) * netPool) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.months - a.months || a.name.localeCompare(b.name));

  return { periodKey, ...meta, poolAmount, damages, netPool, totalShares, rows };
}
