/**
 * The crew member's own view of their feedback.
 *
 * Deliberately its own module, not crew-meetings.ts: that file is back-office
 * only. This one is read by /profile, which every crew login can open, so it
 * takes ONLY the signed-in employee's id (callers pass getCurrentEmployee().id)
 * and returns ONLY notes already gone over with them — linked to a meeting that
 * has actually been completed. A pending note is never selectable from here.
 */

import { query } from '@/lib/db';

export interface MyFeedbackNote {
  id: string;
  kind: string;
  body: string;
  job_label: string | null;
  crew_response: string | null;
  discussed_on: string;
  meeting_type: string;
}

export async function getMyDiscussedFeedback(employeeId: string): Promise<MyFeedbackNote[]> {
  return query<MyFeedbackNote>(
    `SELECT n.id, n.kind, n.body, n.job_label, n.crew_response,
            m.completed_at::date::text AS discussed_on, m.type AS meeting_type
       FROM crew_feedback_notes n
       JOIN crew_meetings m ON m.id = n.meeting_id
      WHERE n.employee_id = $1
        AND n.discussed_at IS NOT NULL
        AND m.completed_at IS NOT NULL
        AND m.employee_id = n.employee_id
      ORDER BY m.completed_at DESC, n.created_at`,
    [employeeId]
  );
}
