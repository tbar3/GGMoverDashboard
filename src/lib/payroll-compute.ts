/**
 * Pure weekly-pay computation for one employee, from the aggregated raw-report
 * numbers plus the app-derived inputs (warehouse lateness, marketing hours, bonus,
 * mileage). No DB, no I/O — so it's easy to unit-check against the Excel dashboard.
 *
 * Rules (confirmed with the owner, 2026-08-14):
 *  - Warehouse hours = 0.5h per job-day, minus that week's lateness (late minutes ÷ 60),
 *    floored at 0. (The 7:15–7:45 AM meeting; lateness comes from attendance.)
 *  - Total hours = job + warehouse + marketing (one rate for all).
 *  - Overtime = hours over 40/week; Regular = the rest. (Keyed into ADP RUN, which
 *    applies the 1.5×.) Standard/OT *pay* below is for the audit total only.
 *  - Total Comp = (total×rate) + (OT×½rate) + tips + bonus + commissions + miles.
 * Lunch was retired (folded into the weekly bonus), so it is not computed here.
 * Any field can be overridden upstream before this runs (SmartMoving errors get fixed).
 */

export const WAREHOUSE_HOURS_PER_DAY = 0.5;
export const OT_WEEKLY_THRESHOLD = 40;

export interface WeeklyPayInputs {
  jobHours: number;
  jobDayCount: number;
  standardRate: number;
  marketingHours?: number;
  /** Total late minutes across the week's job-days (subtracted from warehouse time). */
  lateMinutes?: number;
  /** Override the computed warehouse hours entirely (e.g. Cam). */
  warehouseHoursOverride?: number;
  tips?: number;
  commissions?: number;
  bonus?: number;
  miles?: number; // dollars
}

export interface WeeklyPay {
  jobHours: number;
  warehouseHours: number;
  marketingHours: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  standardRate: number;
  standardPay: number; // total hours × rate (all straight-time)
  overtimePay: number; // OT hours × ½ rate (premium)
  tips: number;
  commissions: number;
  bonus: number;
  miles: number;
  totalCompensation: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeWeeklyPay(i: WeeklyPayInputs): WeeklyPay {
  const marketingHours = i.marketingHours ?? 0;
  const warehouseHours =
    i.warehouseHoursOverride ??
    Math.max(0, WAREHOUSE_HOURS_PER_DAY * i.jobDayCount - (i.lateMinutes ?? 0) / 60);

  const totalHours = round2(i.jobHours + warehouseHours + marketingHours);
  const overtimeHours = round2(Math.max(0, totalHours - OT_WEEKLY_THRESHOLD));
  const regularHours = round2(totalHours - overtimeHours);

  const rate = i.standardRate;
  const standardPay = round2(totalHours * rate);
  const overtimePay = round2(overtimeHours * (rate / 2));

  const tips = i.tips ?? 0;
  const commissions = i.commissions ?? 0;
  const bonus = i.bonus ?? 0;
  const miles = i.miles ?? 0;

  const totalCompensation = round2(
    standardPay + overtimePay + tips + bonus + commissions + miles
  );

  return {
    jobHours: round2(i.jobHours),
    warehouseHours: round2(warehouseHours),
    marketingHours: round2(marketingHours),
    totalHours,
    regularHours,
    overtimeHours,
    standardRate: rate,
    standardPay,
    overtimePay,
    tips,
    commissions,
    bonus,
    miles,
    totalCompensation,
  };
}

// ── ADP output mapping ─────────────────────────────────────────
// Two ADP tabs, driven by the employee's classification. W-2 employees get a real
// regular/overtime hours split (ADP applies the 1.5×). 1099 contractors get the OT
// premium baked into "comp hours" (total + OT/2) — comp hours × rate reproduces the
// same gross — plus a single comp-amount for their earnings and a reimbursement.

export type Classification = 'W-2' | '1099';

export interface AdpW2Row {
  employee: string;
  regularHours: number; // ≤ 40
  overtimeHours: number; // > 40
  tips: number;
  bonus: number;
  commissions: number;
  reimbursement: number; // mileage (lunch retired)
}

export interface Adp1099Row {
  contractor: string;
  compHours: number; // total + OT/2
  compAmount: number; // tips + commissions + bonus
  reimbursement: number; // mileage
}

export function toAdpW2Row(name: string, p: WeeklyPay): AdpW2Row {
  return {
    employee: name,
    regularHours: p.regularHours,
    overtimeHours: p.overtimeHours,
    tips: p.tips,
    bonus: p.bonus,
    commissions: p.commissions,
    reimbursement: p.miles,
  };
}

export function toAdp1099Row(name: string, p: WeeklyPay): Adp1099Row {
  return {
    contractor: name,
    compHours: round2(p.totalHours + p.overtimeHours / 2),
    compAmount: round2(p.tips + p.commissions + p.bonus),
    reimbursement: p.miles,
  };
}
