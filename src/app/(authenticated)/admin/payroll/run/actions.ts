'use server';

import { revalidatePath } from 'next/cache';
import { requireBackOffice } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { format } from 'date-fns';

type Result = { ok: boolean; error?: string };

// Overridable numeric fields on payroll_overrides (whitelist → safe to interpolate).
const OVERRIDE_COLUMNS: Record<string, string> = {
  warehouse: 'warehouse_hours',
  tips: 'tips',
  commissions: 'commissions',
  bonus: 'bonus',
  miles: 'miles',
};

function validWeek(w: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(w);
}

/**
 * Put someone on the payroll run who is not in the imported report.
 *
 * Someone who did marketing all week and never went out on a move has no row in
 * the SmartMoving report, so the run cannot see them and they do not get paid.
 * Writing marketing hours for them is what puts them on the roster —
 * computePayrollRun unions marketing_hours into its roster for exactly this case.
 *
 * The rate is stored alongside, because rate normally arrives per-week on the
 * imported row and there is no imported row to carry it.
 */
export async function addMarketingRow(
  employeeId: string,
  weekStart: string,
  hours: number,
  rate: number | null
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!employeeId || !validWeek(weekStart)) return { ok: false, error: 'Bad input' };
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, error: 'Enter the hours worked — a zero-hour row would not pay anything' };
  }
  if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
    return { ok: false, error: 'Rate must be a positive number' };
  }

  // Someone already in the run is corrected through the existing cells, not given a
  // second row — and a duplicate would double-pay them.
  const [existing] = await query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM payroll_entries WHERE employee_id = $1 AND week_start = $2',
    [employeeId, weekStart]
  );
  if (existing && existing.n > 0) {
    return {
      ok: false,
      error: 'That person is already on this run from the imported report — edit their row instead.',
    };
  }

  await query(
    `INSERT INTO marketing_hours (employee_id, week_start, hours, hourly_rate, entered_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (employee_id, week_start)
       DO UPDATE SET hours = $3, hourly_rate = $4, entered_by = $5, updated_at = NOW()`,
    [employeeId, weekStart, hours, rate, guard.employee.id]
  );

  await logChange({
    weekStart,
    employeeId,
    scope: 'marketing',
    field: 'manual_row',
    oldValue: null,
    newValue: `${hours}h @ $${rate ?? 'employee rate'}`,
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll');
  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/**
 * Set the hourly rate on a marketing-only row. Imported rows carry their rate from
 * the report and are not editable here; these rows have nowhere else to get one.
 */
export async function saveMarketingRate(
  employeeId: string,
  weekStart: string,
  rate: number | null
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!employeeId || !validWeek(weekStart)) return { ok: false, error: 'Bad input' };
  if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
    return { ok: false, error: 'Rate must be a positive number' };
  }

  const before = await queryOne<{ hourly_rate: number | null }>(
    'SELECT hourly_rate FROM marketing_hours WHERE employee_id = $1 AND week_start = $2',
    [employeeId, weekStart]
  );
  if (!before) return { ok: false, error: 'No marketing row for that week' };

  await query(
    'UPDATE marketing_hours SET hourly_rate = $3, updated_at = NOW() WHERE employee_id = $1 AND week_start = $2',
    [employeeId, weekStart, rate]
  );

  await logChange({
    weekStart,
    employeeId,
    scope: 'marketing',
    field: 'hourly_rate',
    oldValue: before.hourly_rate == null ? null : String(Number(before.hourly_rate)),
    newValue: rate == null ? null : String(rate),
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll');
  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/** Take a marketing-only person back off the run (removes their marketing hours). */
export async function removeMarketingRow(employeeId: string, weekStart: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!employeeId || !validWeek(weekStart)) return { ok: false, error: 'Bad input' };

  const before = await queryOne<{ hours: number }>(
    'SELECT hours FROM marketing_hours WHERE employee_id = $1 AND week_start = $2',
    [employeeId, weekStart]
  );
  if (!before) return { ok: false, error: 'No marketing row for that week' };

  await query('DELETE FROM marketing_hours WHERE employee_id = $1 AND week_start = $2', [
    employeeId,
    weekStart,
  ]);

  await logChange({
    weekStart,
    employeeId,
    scope: 'marketing',
    field: 'manual_row',
    oldValue: `${Number(before.hours)}h`,
    newValue: null,
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll');
  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/**
 * Append one manual change to the payroll audit trail.
 *
 * The override/marketing/summary tables keep only the CURRENT value, so without
 * this a correction made twice erases its own history. Logging is best-effort and
 * deliberately never throws: an audit-trail hiccup must not fail a payroll
 * correction the back office is trying to save.
 */
async function logChange(entry: {
  weekStart: string;
  employeeId: string | null;
  scope: 'override' | 'marketing' | 'week_summary' | 'classification';
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedByName: string;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO payroll_change_log
         (week_start, employee_id, employee_name, scope, field, old_value, new_value, changed_by, changed_by_name)
       VALUES ($1, $2, (SELECT name FROM employees WHERE id = $2), $3, $4, $5, $6, $7, $8)`,
      [
        entry.weekStart,
        entry.employeeId,
        entry.scope,
        entry.field,
        entry.oldValue,
        entry.newValue,
        entry.changedBy,
        entry.changedByName,
      ]
    );
  } catch (err) {
    console.error('[payroll] change log write failed:', err instanceof Error ? err.message : err);
  }
}

const asText = (v: number | null): string | null => (v == null ? null : String(v));

/**
 * Set (or clear) one manual override for an employee/week. Pass value=null to clear
 * the override and fall back to the computed value.
 */
export async function saveOverride(
  employeeId: string,
  weekStart: string,
  field: string,
  value: number | null
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const col = OVERRIDE_COLUMNS[field];
  if (!col) return { ok: false, error: 'Unknown field' };
  if (!employeeId || !validWeek(weekStart)) return { ok: false, error: 'Bad input' };
  if (value != null && !Number.isFinite(value)) return { ok: false, error: 'Value must be a number' };

  // Capture what it was BEFORE the upsert so the audit trail records from -> to.
  const before = await queryOne<Record<string, number | null>>(
    `SELECT ${col} AS v FROM payroll_overrides WHERE employee_id = $1 AND week_start = $2`,
    [employeeId, weekStart]
  );

  await query(
    `INSERT INTO payroll_overrides (employee_id, week_start, ${col}, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, week_start)
       DO UPDATE SET ${col} = $3, updated_by = $4, updated_at = NOW()`,
    [employeeId, weekStart, value, guard.employee.id]
  );

  await logChange({
    weekStart,
    employeeId,
    scope: 'override',
    field,
    oldValue: before?.v == null ? null : String(Number(before.v)),
    newValue: asText(value),
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/** Enter/update an employee's marketing hours for a week. */
export async function saveMarketingHours(
  employeeId: string,
  weekStart: string,
  hours: number
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!employeeId || !validWeek(weekStart)) return { ok: false, error: 'Bad input' };
  if (!Number.isFinite(hours) || hours < 0) return { ok: false, error: 'Hours must be ≥ 0' };

  const beforeHours = await queryOne<{ hours: number | null }>(
    'SELECT hours FROM marketing_hours WHERE employee_id = $1 AND week_start = $2',
    [employeeId, weekStart]
  );

  await query(
    `INSERT INTO marketing_hours (employee_id, week_start, hours, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, week_start)
       DO UPDATE SET hours = $3, entered_by = $4, updated_at = NOW()`,
    [employeeId, weekStart, hours, guard.employee.id]
  );

  await logChange({
    weekStart,
    employeeId,
    scope: 'marketing',
    field: 'hours',
    oldValue: beforeHours?.hours == null ? null : String(Number(beforeHours.hours)),
    newValue: String(hours),
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll/run');
  revalidatePath('/admin/payroll/marketing');
  return { ok: true };
}

const SUMMARY_COLUMNS: Record<string, string> = {
  jobs: 'jobs',
  revenue: 'revenue',
  gross: 'payroll_gross',
};

/** Save one week-summary business figure (jobs / revenue / payroll-gross override). */
export async function saveWeekSummary(
  weekStart: string,
  field: string,
  value: number | null
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const col = SUMMARY_COLUMNS[field];
  if (!col) return { ok: false, error: 'Unknown field' };
  if (!validWeek(weekStart)) return { ok: false, error: 'Bad week' };
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    return { ok: false, error: 'Must be a number ≥ 0' };
  }

  const beforeSummary = await queryOne<Record<string, number | null>>(
    `SELECT ${col} AS v FROM payroll_week_summary WHERE week_start = $1`,
    [weekStart]
  );

  await query(
    `INSERT INTO payroll_week_summary (week_start, ${col}, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (week_start) DO UPDATE SET ${col} = $2, updated_by = $3, updated_at = NOW()`,
    [weekStart, value, guard.employee.id]
  );

  await logChange({
    weekStart,
    employeeId: null,
    scope: 'week_summary',
    field,
    oldValue: beforeSummary?.v == null ? null : String(Number(beforeSummary.v)),
    newValue: asText(value),
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/** Set an employee's W-2 / 1099 classification (fixes the "unclassified" audit flag). */
export async function setClassification(
  employeeId: string,
  classification: 'W-2' | '1099',
  weekStart?: string
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (classification !== 'W-2' && classification !== '1099') return { ok: false, error: 'Bad classification' };

  const beforeClass = await queryOne<{ classification: string | null }>(
    'SELECT classification FROM employees WHERE id = $1',
    [employeeId]
  );

  await query('UPDATE employees SET classification = $2 WHERE id = $1', [employeeId, classification]);

  // Classification decides which ADP table someone lands in, so it is a payroll
  // change even though it lives on the employee record. Logged against the week
  // being worked so it shows up in that week's audit.
  await logChange({
    weekStart: weekStart && validWeek(weekStart) ? weekStart : format(new Date(), 'yyyy-MM-dd'),
    employeeId,
    scope: 'classification',
    field: 'classification',
    oldValue: beforeClass?.classification ?? null,
    newValue: classification,
    changedBy: guard.employee.id,
    changedByName: guard.employee.name,
  });

  revalidatePath('/admin/payroll/run');
  return { ok: true };
}
