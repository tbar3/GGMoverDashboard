'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { EVAL_CATEGORIES, EVAL_WINDOW_DAYS } from '@/lib/new-crew-eval-shared';

type Result = { ok: boolean; error?: string };

const OUTCOMES = new Set(['pass', 'extend', 'terminate']);

function ratingOrNull(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return Math.round(n);
}

/**
 * Submit a 30-day New Crew Member Evaluation. Writes a completed row; the employee
 * then drops off the pending list. Ratings are 1-5 per category.
 */
export async function submitNewCrewEval(input: {
  employeeId: string;
  outcome: string;
  ratings: Record<string, number | string>;
  notes?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!input.employeeId) return { ok: false, error: 'Missing employee' };
  if (!OUTCOMES.has(input.outcome)) return { ok: false, error: 'Pick an outcome' };

  const emp = await queryOne<{ start_date: string }>(
    'SELECT start_date::text FROM employees WHERE id = $1',
    [input.employeeId]
  );
  if (!emp) return { ok: false, error: 'Employee not found' };

  const dueDate = await queryOne<{ due: string }>(
    `SELECT ($1::date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date::text AS due`,
    [emp.start_date]
  );

  const ratings = EVAL_CATEGORIES.map((c) => ratingOrNull(input.ratings?.[c.key]));

  // Clear any prior open (incomplete) draft so the unique open-eval index is free.
  await query(
    'DELETE FROM new_crew_evaluations WHERE employee_id = $1 AND completed_at IS NULL',
    [input.employeeId]
  );

  await query(
    `INSERT INTO new_crew_evaluations
       (employee_id, due_date, completed_at, completed_by, outcome,
        attendance, attitude, work_ethic, customer_service, care_with_items, follows_procedures, notes)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.employeeId,
      dueDate?.due ?? emp.start_date,
      guard.employee.id,
      input.outcome,
      ratings[0],
      ratings[1],
      ratings[2],
      ratings[3],
      ratings[4],
      ratings[5],
      input.notes?.trim() || null,
    ]
  );

  revalidatePath('/admin');
  revalidatePath(`/admin/employees/${input.employeeId}`);
  revalidatePath('/admin/employees');
  return { ok: true };
}
