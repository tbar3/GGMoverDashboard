'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { getCurrentEmployee } from '@/lib/auth';

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

  revalidatePath('/dashboard');
  return { ok: true };
}

// Pay rate is set by back office (see admin/employees/[id]), never self-service —
// crew cannot change their own rate.
