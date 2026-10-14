/**
 * Crew meetings — the read layer.
 *
 * Two jobs: say who is due a quarterly sit-down, and list what has been booked or
 * held. The due list is COMPUTED, never stored — same principle as
 * getPendingNewCrewEvals(), which derives a 30-day probation review from
 * start_date. A table of generated future meetings drifts the moment someone is
 * hired, leaves, or the review actually happens.
 *
 * Back office only. Every caller sits under /admin, guarded by the admin layout,
 * and every write self-guards again.
 */

import { query, queryOne } from '@/lib/db';
import type {
  CrewMeeting,
  DueCrewMember,
  MeetingTarget,
  FeedbackNote,
  FeedbackJobOption,
  PendingFeedbackSummary,
} from '@/lib/crew-meetings-shared';

export * from '@/lib/crew-meetings-shared';

/**
 * The quarter we are in, in America/New_York.
 *
 * Explicit timezone, like every other date boundary here: a bare CURRENT_DATE
 * rolls over at 8pm ET, so for the last four hours of the final day of a quarter
 * everyone would jump into the next one.
 */
export async function currentQuarter(): Promise<{
  quarter: string;
  start: string;
  end: string;
}> {
  const row = await queryOne<{ quarter: string; start: string; end: string }>(
    `WITH q AS (
       SELECT date_trunc('quarter', (NOW() AT TIME ZONE 'America/New_York'))::date AS qstart
     )
     SELECT to_char(qstart, 'YYYY') || '-Q' || to_char(qstart, 'Q') AS quarter,
            qstart::text                                            AS start,
            ((qstart + INTERVAL '3 months')::date - 1)::text         AS end
       FROM q`
  );
  return row!;
}

/**
 * Crew with no quarterly review booked for the current quarter.
 *
 * Anyone whose start date falls INSIDE this quarter is excluded. They would
 * otherwise read as overdue in their first week, and they have just had — or are
 * about to have — the 30-day new-crew evaluation, which is the conversation that
 * actually belongs at that point.
 *
 * Crew only, matching the evaluation's role filter. Ad-hoc meetings can be booked
 * with anyone; the cadence is a crew tool.
 */
export async function getDueThisQuarter(): Promise<DueCrewMember[]> {
  return query<DueCrewMember>(
    `WITH q AS (
       SELECT date_trunc('quarter', (NOW() AT TIME ZONE 'America/New_York'))::date AS qstart
     )
     SELECT e.id                                                     AS employee_id,
            e.name                                                   AS employee_name,
            e.role,
            to_char(q.qstart, 'YYYY') || '-Q' || to_char(q.qstart, 'Q') AS quarter,
            -- "Due" for almost the whole quarter; "overdue" only in the final
            -- week. A wider window was tried first and it meant the module opened
            -- on day one calling every single person overdue, which trains you to
            -- ignore the colour. Red should mean "this is genuinely about to be
            -- missed", not "the quarter is progressing".
            CASE
              WHEN (NOW() AT TIME ZONE 'America/New_York')::date
                   > ((q.qstart + INTERVAL '3 months')::date - 7)
              THEN 'overdue' ELSE 'due'
            END                                                      AS status,
            (SELECT MAX(m.scheduled_for)::text
               FROM crew_meetings m
              WHERE m.employee_id = e.id
                AND m.type = 'quarterly_review'
                AND m.completed_at IS NOT NULL)                      AS last_review_on
       FROM employees e, q
      WHERE e.is_active = TRUE
        AND e.exclude_from_roster = FALSE
        AND e.role IN ('driver', 'lead', 'helper')
        AND e.start_date < q.qstart
        AND NOT EXISTS (
          SELECT 1 FROM crew_meetings m
           WHERE m.employee_id = e.id
             AND m.type = 'quarterly_review'
             AND m.quarter = to_char(q.qstart, 'YYYY') || '-Q' || to_char(q.qstart, 'Q')
        )
      ORDER BY e.name`
  );
}

const MEETING_SELECT = `
  SELECT m.id, m.employee_id, e.name AS employee_name, m.type, m.quarter,
         m.scheduled_for::text                  AS scheduled_for,
         to_char(m.scheduled_time, 'HH24:MI')   AS scheduled_time,
         m.completed_at, m.notes, m.created_by_name, m.completed_by_name, m.created_at
    FROM crew_meetings m
    JOIN employees e ON e.id = m.employee_id`;

/** Booked but not yet held, soonest first. */
export async function getScheduledMeetings(): Promise<CrewMeeting[]> {
  return query<CrewMeeting>(
    `${MEETING_SELECT}
      WHERE m.completed_at IS NULL
      ORDER BY m.scheduled_for, m.scheduled_time NULLS LAST`
  );
}

/** Held recently — the record of what was actually said. */
export async function getRecentMeetings(limit = 25): Promise<CrewMeeting[]> {
  return query<CrewMeeting>(
    `${MEETING_SELECT}
      WHERE m.completed_at IS NOT NULL
      ORDER BY m.completed_at DESC
      LIMIT $1`,
    [limit]
  );
}

/** Everything for one person, for their employee page. */
export async function getMeetingsForEmployee(employeeId: string): Promise<CrewMeeting[]> {
  return query<CrewMeeting>(
    `${MEETING_SELECT}
      WHERE m.employee_id = $1
      ORDER BY COALESCE(m.completed_at::date, m.scheduled_for) DESC`,
    [employeeId]
  );
}

/**
 * Who a meeting can be booked with.
 *
 * Everyone active, not just crew: "just catch up with a guy" applies to the
 * office too, and only the quarterly cadence is crew-scoped.
 */
export async function getMeetingTargets(): Promise<MeetingTarget[]> {
  return query<MeetingTarget>(
    `SELECT id, name, COALESCE(role, '') AS role,
            (role IN ('driver', 'lead', 'helper')) AS is_crew
       FROM employees
      WHERE is_active = TRUE AND exclude_from_roster = FALSE
      ORDER BY name`
  );
}

/** Count for the People dashboard stat. */
export async function getDueCount(): Promise<number> {
  const due = await getDueThisQuarter();
  return due.length;
}

// ── Feedback notes ───────────────────────────────────────────────────────────

const NOTE_SELECT = `
  SELECT n.id, n.employee_id, n.kind, n.body, n.job_label, n.author_name, n.created_at,
         n.meeting_id, n.discussed_at, n.crew_response
    FROM crew_feedback_notes n`;

/** Every note for one person — pending first, oldest pending first. */
export async function getFeedbackNotesForEmployee(employeeId: string): Promise<FeedbackNote[]> {
  return query<FeedbackNote>(
    `${NOTE_SELECT}
      WHERE n.employee_id = $1
      ORDER BY (n.discussed_at IS NULL) DESC,
               CASE WHEN n.discussed_at IS NULL THEN n.created_at END ASC,
               n.discussed_at DESC`,
    [employeeId]
  );
}

/** Pending notes for everyone, oldest first — what the board's meeting rows need. */
export async function getAllPendingFeedbackNotes(): Promise<FeedbackNote[]> {
  return query<FeedbackNote>(
    `${NOTE_SELECT}
      WHERE n.discussed_at IS NULL
      ORDER BY n.created_at`
  );
}

/** Who has feedback waiting, longest-waiting first. */
export async function getPendingFeedbackSummary(): Promise<PendingFeedbackSummary[]> {
  return query<PendingFeedbackSummary>(
    `SELECT e.id AS employee_id, e.name AS employee_name,
            COUNT(*)::int        AS pending_count,
            MIN(n.created_at)    AS oldest_pending_at,
            (SELECT MAX(m.completed_at)::date::text FROM crew_meetings m
              WHERE m.employee_id = e.id AND m.completed_at IS NOT NULL) AS last_met_on,
            EXISTS (SELECT 1 FROM crew_meetings m
                     WHERE m.employee_id = e.id AND m.completed_at IS NULL) AS has_upcoming
       FROM crew_feedback_notes n
       JOIN employees e ON e.id = n.employee_id
      WHERE n.discussed_at IS NULL AND e.is_active = TRUE
      GROUP BY e.id, e.name
      ORDER BY MIN(n.created_at)`
  );
}

/** Jobs this person worked recently, for attaching a note to one. */
export async function getFeedbackJobOptions(employeeId: string, limit = 60): Promise<FeedbackJobOption[]> {
  return query<FeedbackJobOption>(
    `SELECT id,
            to_char(date, 'Mon FMDD, YYYY') || ' · ' || COALESCE(customer_name, 'Customer')
              || COALESCE(' · #' || job_number, '') AS label
       FROM jobs
      WHERE $1::uuid = ANY(COALESCE(crew_ids, '{}'))
      ORDER BY date DESC
      LIMIT $2`,
    [employeeId, limit]
  );
}
