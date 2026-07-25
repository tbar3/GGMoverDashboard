import { query, queryOne } from '@/lib/db';
import { EVAL_WINDOW_DAYS, type NewCrewEvaluation, type PendingEval } from '@/lib/new-crew-eval-shared';

/**
 * 30-day New Crew Member Evaluation. Every new crew hire gets a probation review
 * 30 days after their start date. "Pending" is computed from start_date so no rows
 * need pre-seeding; a completed row is written when the review is submitted.
 */

export {
  EVAL_WINDOW_DAYS,
  EVAL_CATEGORIES,
  type EvalCategoryKey,
  type NewCrewEvaluation,
  type PendingEval,
} from '@/lib/new-crew-eval-shared';

/** The latest evaluation row for an employee (completed or draft), if any. */
export async function getEvaluationForEmployee(employeeId: string): Promise<NewCrewEvaluation | null> {
  return queryOne<NewCrewEvaluation>(
    `SELECT ev.*, ce.name AS completed_by_name
       FROM new_crew_evaluations ev
       LEFT JOIN employees ce ON ce.id = ev.completed_by
      WHERE ev.employee_id = $1
      ORDER BY ev.created_at DESC
      LIMIT 1`,
    [employeeId]
  );
}

/**
 * Active crew members whose 30-day eval is not yet completed. `upcoming` are
 * inside a 7-day lead window; `due`/`overdue` are past the due date. Back-office
 * roles are excluded — this is a crew probation tool.
 */
export async function getPendingNewCrewEvals(): Promise<PendingEval[]> {
  return query<PendingEval>(
    `SELECT e.id AS "employeeId", e.name AS "employeeName",
            e.start_date::text AS "startDate",
            (e.start_date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date::text AS "dueDate",
            ((e.start_date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date - CURRENT_DATE) AS "daysUntilDue",
            CASE
              WHEN (e.start_date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date < CURRENT_DATE THEN 'overdue'
              WHEN (e.start_date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date <= CURRENT_DATE THEN 'due'
              ELSE 'upcoming'
            END AS status
       FROM employees e
      WHERE e.is_active = TRUE
        AND e.role IN ('driver', 'lead', 'helper')
        AND NOT EXISTS (
          SELECT 1 FROM new_crew_evaluations ev
           WHERE ev.employee_id = e.id AND ev.completed_at IS NOT NULL
        )
        AND (e.start_date + INTERVAL '${EVAL_WINDOW_DAYS} days')::date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY "dueDate"`
  );
}
