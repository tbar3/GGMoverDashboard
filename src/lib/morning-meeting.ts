/**
 * Morning Meeting — the read layer for the 7:15–7:45 AM stand-up.
 *
 * Three things get walked, in this order:
 *   1. Recognition — every positive logged since it was last read out. A positive
 *      stays on the board until someone dismisses it, so a skipped meeting or a
 *      weekend never swallows someone's win.
 *   2. Reminders   — whatever came up that morning, typed straight in.
 *   3. Policy of the Day — one standing reminder, auto-rotated least-recently-shown,
 *      overridable by pinning.
 *
 * Back office only. Every caller sits under /admin, which is guarded by
 * src/app/(authenticated)/admin/layout.tsx, and every write self-guards again.
 */

import { query, queryOne } from '@/lib/db';
import { positiveLabel } from '@/lib/bonus';
import type {
  RecognitionItem,
  RecognitionGroup,
  MeetingNote,
  PolicyOfDay,
} from '@/lib/morning-meeting-shared';
import type { Policy } from '@/lib/policies-shared';

// Re-exported so server callers can reach the shared types from the module they
// already import; client components import them from -shared directly.
export * from '@/lib/morning-meeting-shared';

/** Today's calendar date in America/New_York, as yyyy-MM-dd. */
export async function meetingToday(): Promise<string> {
  const row = await queryOne<{ d: string }>(
    "SELECT (NOW() AT TIME ZONE 'America/New_York')::date::text AS d"
  );
  return row!.d;
}

/**
 * Every positive not yet dismissed, grouped by crew member.
 *
 * "Fresh" means the positive happened on the most recent day that has any
 * undismissed activity — normally yesterday. Anything older is carried forward
 * under "still up", which is the whole point of dismissal being manual: the
 * Monday meeting still shows Saturday's win.
 */
export async function getRecognitionBoard(): Promise<RecognitionGroup[]> {
  const rows = await query<Omit<RecognitionItem, 'type_label' | 'is_fresh'>>(
    `SELECT p.id,
            p.employee_id,
            e.name                AS employee_name,
            p.type,
            p.discretionary,
            p.event_date::text    AS event_date,
            GREATEST(p.event_date, (p.created_at AT TIME ZONE 'America/New_York')::date)::text
                                  AS board_date,
            p.note,
            j.customer_name       AS job_customer,
            c.name                AS awarded_by,
            p.created_at
       FROM bonus_positives p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN morning_meeting_recognitions r ON r.positive_id = p.id
       LEFT JOIN jobs j ON j.id = p.job_id
       LEFT JOIN employees c ON c.id = p.created_by
      WHERE r.positive_id IS NULL
      ORDER BY board_date DESC, p.created_at DESC`
  );

  // Freshness runs off board_date — the day a win APPEARED here — not off a literal
  // "yesterday", and not off event_date alone. Two reasons. On a Monday, yesterday
  // is Sunday and the wins to read out are Saturday's. And a 5-star review for a
  // job three weeks ago can be credited today: it is the newest thing on the board
  // even though the move is old, and dimming it as "carried over" would say the
  // room has already heard it.
  const newest = rows[0]?.board_date ?? null;

  const groups = new Map<string, RecognitionGroup>();
  for (const row of rows) {
    const item: RecognitionItem = {
      ...row,
      type_label: positiveLabel(row.type),
      is_fresh: row.board_date === newest,
    };
    let group = groups.get(row.employee_id);
    if (!group) {
      group = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        items: [],
        fresh_count: 0,
      };
      groups.set(row.employee_id, group);
    }
    group.items.push(item);
    if (item.is_fresh) group.fresh_count += 1;
  }

  // Most-recently-recognized crew first, so the newest wins get read out first.
  return [...groups.values()].sort(
    (a, b) => b.fresh_count - a.fresh_count || a.employee_name.localeCompare(b.employee_name)
  );
}

/**
 * Policies eligible to be a Policy of the Day, with coverage derived from the day
 * log — no cached counters to drift when a pin overrides an auto-pick.
 *
 * Eligibility is published AND in_rotation: a policy can be crew-readable without
 * being a good 30-second thing to read out at 7:15.
 */
const ROTATION_SELECT = `
  SELECT p.id, p.title, p.title_es, p.body_en, p.body_es, p.category, p.status,
         p.in_rotation, p.needs_review, p.sort_order, p.created_at, p.updated_at,
         d.last_on::text            AS last_featured_on,
         COALESCE(d.times, 0)::int  AS feature_count
    FROM policies p
    LEFT JOIN (
      SELECT policy_id, MAX(meeting_date) AS last_on, COUNT(*) AS times
        FROM morning_meeting_days
       WHERE policy_id IS NOT NULL
       GROUP BY policy_id
    ) d ON d.policy_id = p.id`;

/** The policies that can be picked or pinned today. */
export async function getRotationPolicies(): Promise<Policy[]> {
  return query<Policy>(
    `${ROTATION_SELECT}
      WHERE p.status = 'published' AND p.in_rotation = TRUE
      ORDER BY p.category, p.sort_order, p.title`
  );
}

/** Ad-hoc reminders logged in the last `days` meetings, newest first. */
export async function getNotes(days = 14): Promise<MeetingNote[]> {
  return query<MeetingNote>(
    `SELECT n.id, n.meeting_date::text AS meeting_date, n.body, n.policy_id,
            p.title AS policy_title, n.author_name, n.created_at
       FROM morning_meeting_notes n
       LEFT JOIN policies p ON p.id = n.policy_id
      WHERE n.meeting_date >= (NOW() AT TIME ZONE 'America/New_York')::date - $1::int
      ORDER BY n.meeting_date DESC, n.created_at DESC`,
    [days]
  );
}

/**
 * The Policy of the Day: whatever is already recorded for today, otherwise the
 * least-recently-featured active reminder, claimed for today.
 *
 * The first page view of the day claims a pick by writing today's row, which is
 * both what advances the rotation and what makes the day's choice stable for
 * everyone who opens the page afterwards. Later views are pure reads. The insert
 * races safely: the conflict clause only fills a row that has no reminder yet, so
 * a second concurrent viewer cannot overwrite the winner's pick.
 */
export async function getPolicyOfDay(today: string): Promise<PolicyOfDay> {
  const existing = await queryOne<{ policy_id: string | null; pinned: boolean }>(
    'SELECT policy_id, pinned FROM morning_meeting_days WHERE meeting_date = $1',
    [today]
  );

  if (existing) {
    const policy = existing.policy_id ? await getRotationPolicy(existing.policy_id) : null;
    // A pinned-then-deleted policy leaves the row pointing at nothing; fall
    // through to a fresh pick rather than showing an empty card all day.
    if (policy) {
      return {
        policy,
        pinned: existing.pinned,
        empty: false,
        ...(await priorCoverage(policy.id, today)),
      };
    }
  }

  const next = await queryOne<{ id: string }>(
    `SELECT p.id
       FROM policies p
       LEFT JOIN (
         SELECT policy_id, MAX(meeting_date) AS last_on, COUNT(*) AS times
           FROM morning_meeting_days
          WHERE policy_id IS NOT NULL
          GROUP BY policy_id
       ) d ON d.policy_id = p.id
      WHERE p.status = 'published' AND p.in_rotation = TRUE
      ORDER BY d.last_on ASC NULLS FIRST, d.times ASC NULLS FIRST,
               p.sort_order ASC, p.created_at ASC, p.title ASC
      LIMIT 1`
  );
  if (!next) {
    return { policy: null, pinned: false, empty: true, prior_times: 0, prior_last_on: null };
  }

  await query(
    `INSERT INTO morning_meeting_days (meeting_date, policy_id)
     VALUES ($1, $2)
     ON CONFLICT (meeting_date) DO UPDATE
        SET policy_id = EXCLUDED.policy_id, updated_at = NOW()
      WHERE morning_meeting_days.policy_id IS NULL`,
    [today, next.id]
  );

  // Re-read: if another viewer won the race, theirs is the pick of record.
  const settled = await queryOne<{ policy_id: string | null; pinned: boolean }>(
    'SELECT policy_id, pinned FROM morning_meeting_days WHERE meeting_date = $1',
    [today]
  );
  const chosenId = settled?.policy_id ?? next.id;

  const policy = await getRotationPolicy(chosenId);
  return {
    policy,
    pinned: settled?.pinned ?? false,
    empty: !policy,
    ...(await priorCoverage(chosenId, today)),
  };
}

/** How often a policy was covered on days strictly before `today`. */
async function priorCoverage(
  policyId: string,
  today: string
): Promise<{ prior_times: number; prior_last_on: string | null }> {
  const row = await queryOne<{ prior_times: number; prior_last_on: string | null }>(
    `SELECT COUNT(*)::int AS prior_times, MAX(meeting_date)::text AS prior_last_on
       FROM morning_meeting_days
      WHERE policy_id = $1 AND meeting_date < $2`,
    [policyId, today]
  );
  return { prior_times: row?.prior_times ?? 0, prior_last_on: row?.prior_last_on ?? null };
}

async function getRotationPolicy(id: string): Promise<Policy | null> {
  return queryOne<Policy>(`${ROTATION_SELECT} WHERE p.id = $1`, [id]);
}

/** Meeting days already covered, newest first — the "what did we cover" history. */
export async function getPolicyHistory(limit = 10): Promise<
  { meeting_date: string; title: string | null; pinned: boolean }[]
> {
  return query(
    `SELECT d.meeting_date::text AS meeting_date, p.title, d.pinned
       FROM morning_meeting_days d
       LEFT JOIN policies p ON p.id = d.policy_id
      ORDER BY d.meeting_date DESC
      LIMIT $1`,
    [limit]
  );
}
