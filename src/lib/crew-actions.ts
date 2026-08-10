'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { getCurrentEmployee } from '@/lib/auth';
import { notifyAdminsOfDecline } from '@/lib/job-decline-alert';

// Crew-facing self-service actions. Each self-guards: an employee acts only on
// their own jobs / their own profile.

export type JobResponse = 'accepted' | 'declined';

/**
 * Accept or decline an assigned job. The employee must actually be on the job's
 * crew (crew_ids), so nobody can respond on another job's behalf. Declines
 * require a reason. Idempotent per (job, employee) — re-responding updates.
 */
export async function respondToJob(
  jobId: string,
  response: JobResponse,
  declineReason?: string
): Promise<{ ok: boolean; error?: string }> {
  const employee = await getCurrentEmployee();
  if (!employee || !employee.is_active) return { ok: false, error: 'Not authorized' };

  if (response === 'declined' && !declineReason?.trim()) {
    return { ok: false, error: 'A reason is required to decline.' };
  }

  // Confirm this employee is assigned to this job.
  const job = await queryOne<{ id: string }>(
    'SELECT id FROM jobs WHERE id = $1 AND $2 = ANY(crew_ids)',
    [jobId, employee.id]
  );
  if (!job) return { ok: false, error: 'That job is not assigned to you.' };

  await query(
    `INSERT INTO job_responses (job_id, employee_id, response, decline_reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (job_id, employee_id) DO UPDATE
       SET response = EXCLUDED.response,
           decline_reason = EXCLUDED.decline_reason,
           responded_at = NOW()`,
    [jobId, employee.id, response, response === 'declined' ? declineReason!.trim() : null]
  );

  // Policy: declining after the Sunday 3PM cutoff (but before the job) is a
  // late call-out → automatic strike. Never let this break the decline itself.
  if (response === 'declined') {
    try {
      await maybeAutoCallOutStrike(jobId, employee.id);
    } catch {
      /* strike automation is best-effort; the decline is already recorded */
    }

    // Email the back office so the job can be re-staffed. Best-effort — a mail
    // failure must never break the decline the crew member just recorded.
    try {
      await notifyAdminsOfDecline(jobId, employee.name, declineReason!.trim());
    } catch {
      /* notification is best-effort; the decline is already recorded */
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/jobs');
  revalidatePath('/admin');
  revalidatePath('/admin/performance');
  return { ok: true };
}

/**
 * Create an automatic Call-Out strike when a decline lands in the penalty window:
 * from the Sunday 3PM EST before the job's week up to the job's start time. The
 * schedule locks that Sunday, so a late decline forfeits the week like any strike.
 * Deduped one-per-job; the effective (record) date is today, so it counts toward
 * the current bonus week. Cascades to the 3-strikes/week auto write-up.
 */
async function maybeAutoCallOutStrike(jobId: string, employeeId: string): Promise<void> {
  const created = await queryOne<{ week_start: string }>(
    `INSERT INTO bonus_strikes
       (employee_id, week_start, type, event_date, effective_date, note, source, created_by, job_id)
     SELECT
       $2,
       date_trunc('week', (NOW() AT TIME ZONE 'America/New_York')::date)::date,
       'CALL_OUT',
       j.date,
       (NOW() AT TIME ZONE 'America/New_York')::date,
       'Auto: declined after the Sunday 3PM cutoff — '
         || COALESCE(j.customer_name, 'job') || ' on ' || to_char(j.date, 'Mon FMDD'),
       'auto',
       NULL,
       j.id
     FROM jobs j
     WHERE j.id = $1
       -- decline (now) is at/after the Sunday 3PM ET before the job's week...
       AND NOW() >= ((date_trunc('week', j.date)::date - 1) + time '15:00') AT TIME ZONE 'America/New_York'
       -- ...and before the job's start (fall back to end of the job day if no time)
       AND NOW() < (j.date + COALESCE(to_timestamp(NULLIF(j.start_time, ''), 'HH12:MI AM')::time, time '23:59'))
             AT TIME ZONE 'America/New_York'
       AND NOT EXISTS (
         SELECT 1 FROM bonus_strikes s
          WHERE s.employee_id = $2 AND s.job_id = j.id AND s.type = 'CALL_OUT' AND s.source = 'auto'
       )
     RETURNING week_start::text AS week_start`,
    [jobId, employeeId]
  );
  if (!created) return;

  // Cascade: 3 active strikes in the (effective) week auto-files a write-up.
  const cfg = await queryOne<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'bonus_strike_forfeit_threshold'"
  );
  const threshold = Math.max(1, Math.round(Number(cfg?.value ?? 3)) || 3);
  await query(
    `INSERT INTO write_ups (employee_id, week_start, event_date, effective_date, summary, source, created_by)
     SELECT $1, $2::date, (NOW() AT TIME ZONE 'America/New_York')::date,
            (NOW() AT TIME ZONE 'America/New_York')::date,
            'Automatic write-up: reached ' || $3 || ' strikes in the week of ' || $2,
            'auto', NULL
      WHERE (SELECT COUNT(*) FROM bonus_strikes
               WHERE employee_id = $1 AND week_start = $2::date AND voided = FALSE) >= $3
        AND NOT EXISTS (
          SELECT 1 FROM write_ups WHERE employee_id = $1 AND week_start = $2::date AND source = 'auto'
        )`,
    [employeeId, created.week_start, threshold]
  );
}

// Pay rate is set by back office (see admin/employees/[id]), never self-service —
// crew cannot change their own rate.
