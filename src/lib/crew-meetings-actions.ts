'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { currentQuarter } from '@/lib/crew-meetings';

// Crew meeting writes — back office only. Every action self-guards; the /admin
// layout protects the page, but a server action is its own entry point.

type Result = { ok: boolean; error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function revalidate(employeeId?: string) {
  revalidatePath('/admin/meetings');
  revalidatePath('/admin/people');
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

/**
 * Book a meeting.
 *
 * For a quarterly review the quarter comes from TODAY, not from the date picked.
 * You are booking "this quarter's review"; scheduling it for the first week of
 * the next quarter — which happens constantly — still closes out the one you are
 * in, and the unique index then stops a second one being booked for the same
 * quarter.
 */
export async function scheduleMeeting(input: {
  employeeId: string;
  type: 'quarterly_review' | 'feedback_positive' | 'feedback_negative' | 'catch_up';
  scheduledFor: string;
  scheduledTime?: string;
  notes?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!DATE_RE.test(input.scheduledFor)) return { ok: false, error: 'Pick a date' };
  // An empty time input posts "", which is not a TIME. A missing time is not
  // worth failing a booking over.
  const time = TIME_RE.test(input.scheduledTime ?? '') ? input.scheduledTime : null;

  const quarter =
    input.type === 'quarterly_review' ? (await currentQuarter()).quarter : null;

  try {
    await query(
      `INSERT INTO crew_meetings
         (employee_id, type, quarter, scheduled_for, scheduled_time, notes,
          created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.employeeId,
        input.type,
        quarter,
        input.scheduledFor,
        time,
        input.notes?.trim() || null,
        guard.employee.id,
        guard.employee.name,
      ]
    );
  } catch (err) {
    // 23505 = the one-review-per-quarter index. Anything else is a real fault.
    if ((err as { code?: string }).code === '23505') {
      return { ok: false, error: 'They already have a review for this quarter' };
    }
    throw err;
  }

  revalidate(input.employeeId);
  return { ok: true };
}

/**
 * Record what was said, and close the meeting out — and mark which of the
 * person's pending feedback notes were gone over in it.
 *
 * Notes are required. The database enforces it too — the record, not the calendar
 * entry, is the thing that makes a recurring problem visible months later.
 *
 * One transaction, because closing the meeting is what makes the discussed notes
 * visible to the crew member: a meeting closed without its notes, or notes linked
 * to a meeting that failed to close, would each show them the wrong thing.
 * Notes not ticked stay pending for the next sit-down.
 */
export async function completeMeeting(input: {
  id: string;
  notes: string;
  discussed?: { noteId: string; response?: string }[];
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const notes = input.notes.trim();
  if (!notes) return { ok: false, error: 'Write down what was said first' };

  const discussed = input.discussed ?? [];

  const result = await withTransaction(async (client) => {
    const meeting = await client.query<{ employee_id: string }>(
      `UPDATE crew_meetings
          SET completed_at = NOW(), notes = $2,
              completed_by = $3, completed_by_name = $4, updated_at = NOW()
        WHERE id = $1 AND completed_at IS NULL
        RETURNING employee_id`,
      [input.id, notes, guard.employee.id, guard.employee.name]
    );
    const employeeId = meeting.rows[0]?.employee_id;
    if (!employeeId) return null;

    for (const d of discussed) {
      // Scoped to this meeting's person and to still-pending notes, so a stale
      // form can neither attach someone else's note nor re-stamp a discussed one.
      await client.query(
        `UPDATE crew_feedback_notes
            SET meeting_id = $2, discussed_at = NOW(),
                crew_response = $4, updated_at = NOW()
          WHERE id = $1 AND employee_id = $3 AND discussed_at IS NULL`,
        [d.noteId, input.id, employeeId, d.response?.trim() || null]
      );
    }
    return employeeId;
  });
  if (!result) return { ok: false, error: 'That meeting is already closed out' };

  revalidate(result);
  revalidatePath('/profile');
  return { ok: true };
}

/** Move a meeting that has not happened yet. */
export async function rescheduleMeeting(input: {
  id: string;
  scheduledFor: string;
  scheduledTime?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!DATE_RE.test(input.scheduledFor)) return { ok: false, error: 'Pick a date' };
  const time = TIME_RE.test(input.scheduledTime ?? '') ? input.scheduledTime : null;

  const row = await queryOne<{ employee_id: string }>(
    `UPDATE crew_meetings
        SET scheduled_for = $2, scheduled_time = $3, updated_at = NOW()
      WHERE id = $1 AND completed_at IS NULL
      RETURNING employee_id`,
    [input.id, input.scheduledFor, time]
  );
  if (!row) return { ok: false, error: 'A meeting that has happened cannot be moved' };

  revalidate(row.employee_id);
  return { ok: true };
}

/**
 * Drop a meeting that never happened.
 *
 * Only while it is still scheduled: a completed meeting is the record, and the
 * point of the record is that it cannot be tidied away later.
 */
export async function deleteMeeting(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const row = await queryOne<{ employee_id: string }>(
    'DELETE FROM crew_meetings WHERE id = $1 AND completed_at IS NULL RETURNING employee_id',
    [id]
  );
  if (!row) return { ok: false, error: 'A meeting that has happened cannot be deleted' };

  revalidate(row.employee_id);
  return { ok: true };
}

// ── Feedback notes ───────────────────────────────────────────────────────────

const NOTE_KINDS = ['praise', 'needs_work', 'coaching'] as const;

/** Log a piece of feedback for someone, to go over at their next sit-down. */
export async function addFeedbackNote(input: {
  employeeId: string;
  kind: string;
  body: string;
  jobId?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Write the feedback first' };
  if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) {
    return { ok: false, error: 'Pick praise, needs work or coaching' };
  }
  const person = await queryOne<{ id: string }>(
    'SELECT id FROM employees WHERE id = $1 AND is_active = TRUE',
    [input.employeeId]
  );
  if (!person) return { ok: false, error: 'That person is not on the active roster' };

  // The label is built here from the job row, never taken from the client, and
  // only for a job this person actually worked.
  let jobId: string | null = null;
  let jobLabel: string | null = null;
  if (input.jobId) {
    const job = await queryOne<{ id: string; label: string }>(
      `SELECT id,
              to_char(date, 'Mon FMDD, YYYY') || ' · ' || COALESCE(customer_name, 'Customer')
                || COALESCE(' · #' || job_number, '') AS label
         FROM jobs WHERE id = $1 AND $2::uuid = ANY(COALESCE(crew_ids, '{}'))`,
      [input.jobId, input.employeeId]
    );
    if (!job) return { ok: false, error: 'That job is not one of theirs' };
    jobId = job.id;
    jobLabel = job.label;
  }

  await query(
    `INSERT INTO crew_feedback_notes
       (employee_id, kind, body, job_id, job_label, author_id, author_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.employeeId, input.kind, body, jobId, jobLabel, guard.employee.id, guard.employee.name]
  );
  revalidate(input.employeeId);
  return { ok: true };
}

/** Reword a note — only while it is still pending. */
export async function updateFeedbackNote(input: {
  id: string;
  kind: string;
  body: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Write the feedback first' };
  if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) {
    return { ok: false, error: 'Pick praise, needs work or coaching' };
  }
  const row = await queryOne<{ employee_id: string }>(
    `UPDATE crew_feedback_notes SET kind = $2, body = $3, updated_at = NOW()
      WHERE id = $1 AND discussed_at IS NULL RETURNING employee_id`,
    [input.id, input.kind, body]
  );
  if (!row) return { ok: false, error: 'A note that has been discussed cannot be changed' };
  revalidate(row.employee_id);
  return { ok: true };
}

/**
 * Remove a note that was never discussed. A discussed note is part of the
 * record of what was said — the same reason a completed meeting can't be deleted.
 */
export async function deleteFeedbackNote(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  const row = await queryOne<{ employee_id: string }>(
    'DELETE FROM crew_feedback_notes WHERE id = $1 AND discussed_at IS NULL RETURNING employee_id',
    [id]
  );
  if (!row) return { ok: false, error: 'A note that has been discussed cannot be deleted' };
  revalidate(row.employee_id);
  return { ok: true };
}
