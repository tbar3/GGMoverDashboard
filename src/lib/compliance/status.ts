import type { ComplianceState, PmState } from './types';

/**
 * Where "is this expiring?" is answered — once, in SQL, for every list in the
 * module.
 *
 * The derived state is NEVER stored. A stored state is wrong the moment the clock
 * passes midnight and nothing writes the row, which is the precise failure this
 * module exists to prevent — and with no cron in v1 there is nothing that would
 * refresh it either.
 *
 * These are exported SQL strings rather than a database VIEW because this project
 * has no views anywhere, and logic buried in an applied migration is invisible to
 * anyone grepping src/.
 */

/**
 * Today, in the timezone the business actually operates in.
 *
 * Load-bearing. Neon runs UTC, so a bare CURRENT_DATE rolls over at 8pm ET — and
 * between 8pm and midnight every item expiring today would read as "expired".
 * Every date comparison in this module goes through this expression.
 */
export const TODAY_SQL = `(NOW() AT TIME ZONE 'America/New_York')::date`;

/** Expects the compliance_items row aliased as `i`. */
export const COMPLIANCE_STATE_SQL = `
  CASE
    WHEN i.expiration_date IS NULL                            THEN 'no_expiry'
    WHEN i.expiration_date <  ${TODAY_SQL}                    THEN 'expired'
    WHEN i.expiration_date <= ${TODAY_SQL} + i.lead_time_days THEN 'due_soon'
    ELSE 'ok'
  END`;

/** Days from today until expiry — negative once overdue. */
export const DAYS_UNTIL_SQL = `(i.expiration_date - ${TODAY_SQL})`;

/**
 * Expects vehicle_pm_schedules as `s` and vehicles as `v`.
 *
 * PM runs two independent clocks and is due when EITHER fires, so this takes the
 * worse of the two. The mileage clock is skipped entirely when the odometer is
 * unknown rather than assumed to be fine.
 *
 * 'unknown' is a real state, not a fallback: a schedule with no baseline service
 * has nothing to count from. Showing it as 'ok' is a lie, and showing it as
 * 'expired' cries wolf on every newly-created schedule.
 */
export const PM_STATE_SQL = `
  CASE
    WHEN s.next_due_date IS NOT NULL
         AND s.next_due_date < ${TODAY_SQL}                              THEN 'expired'
    WHEN s.next_due_odometer IS NOT NULL AND v.current_odometer IS NOT NULL
         AND v.current_odometer >= s.next_due_odometer                   THEN 'expired'
    WHEN s.next_due_date IS NOT NULL
         AND s.next_due_date <= ${TODAY_SQL} + s.lead_time_days          THEN 'due_soon'
    WHEN s.next_due_odometer IS NOT NULL AND v.current_odometer IS NOT NULL
         AND v.current_odometer >= s.next_due_odometer - s.lead_miles    THEN 'due_soon'
    WHEN s.last_service_date IS NULL AND s.last_service_odometer IS NULL THEN 'unknown'
    ELSE 'ok'
  END`;

/**
 * One ordering key, so the overview, the registry and the fleet page all sort the
 * same way and a row never appears to move between screens.
 */
export function stateOrderSql(stateExpr: string): string {
  return `CASE ${stateExpr}
            WHEN 'expired'  THEN 0
            WHEN 'due_soon' THEN 1
            WHEN 'unknown'  THEN 2
            WHEN 'ok'       THEN 3
            ELSE 4
          END`;
}

/** The two states that need someone to do something. Drives the nav badge. */
export const OPEN_STATES: readonly string[] = ['expired', 'due_soon'];

/**
 * The TS mirror of COMPLIANCE_STATE_SQL.
 *
 * Exists ONLY so a form can preview "this will show as Due Soon" while the user
 * is still typing a date. It is never the source of truth for a list — if the two
 * ever disagree, SQL wins.
 */
export function deriveState(
  expirationDate: string | null,
  leadTimeDays: number,
  today: Date = new Date()
): ComplianceState {
  if (!expirationDate) return 'no_expiry';
  const days = daysBetween(today, expirationDate);
  if (days < 0) return 'expired';
  if (days <= leadTimeDays) return 'due_soon';
  return 'ok';
}

/** Whole days from `from` to the YYYY-MM-DD `iso`, comparing calendar dates only. */
export function daysBetween(from: Date, iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - start) / 86_400_000);
}

/**
 * Add whole months to a YYYY-MM-DD date, clamping to the end of the month.
 *
 * Used to prefill the next expiration from cadence_months when a renewal is
 * recorded. The clamp matters: Jan 31 + 1 month must be Feb 28, not Mar 3, which
 * is what naive Date arithmetic produces.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in the browser's local time — for prefilling date inputs. */
export function todayLocalIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export const STATE_LABELS: Record<PmState, string> = {
  expired: 'Expired',
  due_soon: 'Due Soon',
  ok: 'OK',
  no_expiry: 'No Expiry',
  unknown: 'Needs Baseline',
};
