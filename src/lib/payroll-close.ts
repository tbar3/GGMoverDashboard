'use server';

import { revalidatePath } from 'next/cache';
import { queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { computePayrollRun, getClosedRun, getWeekSummary } from '@/lib/payroll-run';

/**
 * Closing and re-opening a payroll week.
 *
 * Closing is the moment a week stops being a calculation and becomes a record.
 * Everything downstream — the export, the history, the trends — reads what is
 * written here, never a recomputation.
 */

type Result = { ok: boolean; error?: string };

function revalidate() {
  revalidatePath('/admin/payroll');
  revalidatePath('/admin/payroll', 'layout');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Freeze a week.
 *
 * Requires the bonus week to be approved first. That is not bureaucracy: until it
 * is approved the bonus is recomputed live from strikes and positives, so closing
 * against it would freeze a number that was still moving — and the whole reason to
 * close is that the number stops moving.
 */
export async function closePayrollWeek(weekStart: string, note?: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const existing = await getClosedRun(weekStart);
  if (existing) return { ok: false, error: 'That week is already closed. Re-open it first to make changes.' };

  const bonusWeek = await queryOne<{ status: string }>(
    'SELECT status FROM bonus_weeks WHERE week_start = $1',
    [weekStart]
  );
  if (bonusWeek?.status !== 'approved') {
    return {
      ok: false,
      error:
        'Approve the weekly bonus for this week first — until it is approved the bonus is still being recalculated, so payroll would freeze a number that can still change.',
    };
  }

  const run = await computePayrollRun(weekStart);
  if (run.detail.length === 0) {
    return { ok: false, error: 'There are no payroll rows for this week yet. Import hours first.' };
  }

  const summary = await getWeekSummary(weekStart);

  const grossPayroll = round2(run.detail.reduce((t, r) => t + r.totalCompensation, 0));
  const bonusTotal = round2(run.detail.reduce((t, r) => t + r.bonus, 0));
  const reimbursementTotal = round2(run.detail.reduce((t, r) => t + r.miles, 0));
  const totalHours = round2(run.detail.reduce((t, r) => t + r.totalHours, 0));
  const revenue = summary.revenue;
  // Stored, not recomputed later: a job that closes next month must not silently
  // rewrite a ratio that was already reported for this week.
  const laborRatio = revenue && revenue > 0 ? round2((grossPayroll / revenue) * 10000) / 10000 : null;

  const nextVersion = await queryOne<{ v: number }>(
    'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM payroll_runs WHERE week_start = $1',
    [weekStart]
  );

  await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO payroll_runs
         (week_start, version, period_start, period_end, gross_payroll, bonus_total,
          reimbursement_total, total_hours, headcount, revenue, labor_ratio,
          bonus_week_status, closed_by, closed_by_name, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        weekStart,
        nextVersion?.v ?? 1,
        run.periodStart,
        run.periodEnd,
        grossPayroll,
        bonusTotal,
        reimbursementTotal,
        totalHours,
        run.detail.length,
        revenue,
        laborRatio,
        bonusWeek.status,
        guard.employee.id,
        guard.employee.name,
        note?.trim() || null,
      ]
    );
    const runId = inserted.rows[0].id as string;

    for (const r of run.detail) {
      const basePay = round2(r.totalCompensation - r.tips - r.commissions - r.bonus - r.miles);
      const overtimePay = r.weeklySalary > 0 ? 0 : round2(r.overtimeHours * (r.rate / 2));
      await client.query(
        `INSERT INTO payroll_run_lines
           (run_id, employee_id, employee_name, classification, billable_hours,
            warehouse_hours, marketing_hours, total_hours, regular_hours, overtime_hours,
            hourly_rate, weekly_salary, base_pay, overtime_pay, tips, commissions,
            bonus, mileage_amount, total_compensation, bonus_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          runId,
          r.employeeId || null,
          r.name,
          r.classification,
          r.billableHours,
          r.warehouseHours,
          r.marketingHours,
          r.totalHours,
          r.regularHours,
          r.overtimeHours,
          r.rate,
          r.weeklySalary,
          basePay,
          overtimePay,
          r.tips,
          r.commissions,
          r.bonus,
          r.miles,
          r.totalCompensation,
          r.bonusSource,
        ]
      );
    }

    await client.query(
      `INSERT INTO payroll_change_log
         (week_start, scope, field, old_value, new_value, changed_by, changed_by_name)
       VALUES ($1, 'week', 'status', 'open', $2, $3, $4)`,
      [weekStart, `closed v${nextVersion?.v ?? 1}`, guard.employee.id, guard.employee.name]
    );
  });

  revalidate();
  return { ok: true };
}

/**
 * Re-open a closed week.
 *
 * The existing run is NOT deleted — it is stamped reopened_at and kept. Re-closing
 * writes version + 1 alongside it, so every version that was ever considered final
 * stays readable and the amend trail is complete.
 */
export async function reopenPayrollWeek(weekStart: string, reason: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const trimmed = reason?.trim();
  // Required, deliberately: re-opening a paid week is exactly the action a future
  // reader will want a reason for.
  if (!trimmed) return { ok: false, error: 'Say why this week is being re-opened' };

  const existing = await getClosedRun(weekStart);
  if (!existing) return { ok: false, error: 'That week is not closed' };

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE payroll_runs
          SET reopened_at = NOW(), reopened_by = $2, reopen_reason = $3
        WHERE id = $1`,
      [existing.id, guard.employee.id, trimmed]
    );
    await client.query(
      `INSERT INTO payroll_change_log
         (week_start, scope, field, old_value, new_value, changed_by, changed_by_name)
       VALUES ($1, 'week', 'status', $2, 'open', $3, $4)`,
      [weekStart, `closed v${existing.version}`, guard.employee.id, guard.employee.name]
    );
  });

  revalidate();
  return { ok: true };
}
