'use server';

import { revalidatePath } from 'next/cache';
import { requireBackOffice } from '@/lib/auth';
import { query } from '@/lib/db';

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

  await query(
    `INSERT INTO payroll_overrides (employee_id, week_start, ${col}, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, week_start)
       DO UPDATE SET ${col} = $3, updated_by = $4, updated_at = NOW()`,
    [employeeId, weekStart, value, guard.employee.id]
  );
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

  await query(
    `INSERT INTO marketing_hours (employee_id, week_start, hours, entered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, week_start)
       DO UPDATE SET hours = $3, entered_by = $4, updated_at = NOW()`,
    [employeeId, weekStart, hours, guard.employee.id]
  );
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

  await query(
    `INSERT INTO payroll_week_summary (week_start, ${col}, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (week_start) DO UPDATE SET ${col} = $2, updated_by = $3, updated_at = NOW()`,
    [weekStart, value, guard.employee.id]
  );
  revalidatePath('/admin/payroll/run');
  return { ok: true };
}

/** Set an employee's W-2 / 1099 classification (fixes the "unclassified" audit flag). */
export async function setClassification(
  employeeId: string,
  classification: 'W-2' | '1099'
): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (classification !== 'W-2' && classification !== '1099') return { ok: false, error: 'Bad classification' };

  await query('UPDATE employees SET classification = $2 WHERE id = $1', [employeeId, classification]);
  revalidatePath('/admin/payroll/run');
  return { ok: true };
}
