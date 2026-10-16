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
 *   4. Discussion points — questions about past jobs, open until answered.
 *   5. Feedback       — customer / office feedback queued for the meeting, plus
 *      the crew's own ideas for the crew and the office, open until closed.
 *   Culture — one core value / mission / purpose card per meeting, rotated the
 *      same way as the Policy of the Day.
 *   Materials Check — each truck's overnight count (last final count vs
 *      yesterday's initial count) and yesterday's used vs charged materials.
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
  DiscussionPoint,
  DiscussionJob,
  CrewOption,
  FeedbackItem,
  CultureItem,
  CultureOfDay,
  MaterialsCheck,
  MaterialsCountCheck,
  MaterialsChargeJob,
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

// ── Discussion points ────────────────────────────────────────────────────────

/**
 * Open questions, plus the ones answered recently.
 *
 * Open points carry forward with no expiry — the same reason recognition does. A
 * question raised on a Friday and not answered must still be sitting there on
 * Monday, or the meeting quietly loses it.
 */
export async function getDiscussions(answeredDays = 14): Promise<DiscussionPoint[]> {
  return query<DiscussionPoint>(
    `SELECT id, question, job_id, job_label, employee_id, employee_name, status,
            answer, answered_at, answered_by_name, author_name, created_at
       FROM morning_meeting_discussions
      WHERE status = 'open'
         OR answered_at >= NOW() - ($1::int * INTERVAL '1 day')
      ORDER BY status DESC, created_at DESC`,
    [answeredDays]
  );
}

/**
 * Jobs for the picker: recent first, and bounded.
 *
 * Bounded deliberately. The damages page fetches /api/jobs, which is SELECT *
 * over every job ever run; this page is opened every single morning, so it reads
 * only the columns the picker shows and stops at a few hundred rows.
 */
export async function getDiscussionJobs(limit = 300): Promise<DiscussionJob[]> {
  return query<DiscussionJob>(
    `SELECT id, date::text AS date, customer_name, job_number,
            COALESCE(crew_ids, '{}') AS crew_ids
       FROM jobs
      ORDER BY date DESC
      LIMIT $1`,
    [limit]
  );
}

/** The roster the picker falls back to when a question has no job attached. */
export async function getCrewOptions(): Promise<CrewOption[]> {
  return query<CrewOption>(
    `SELECT id, name, COALESCE(role, '') AS role
       FROM employees
      WHERE is_active = TRUE AND exclude_from_roster = FALSE
      ORDER BY name`
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Open feedback (queued and live), plus what was closed recently.
 *
 * Open items carry forward with no expiry. Items whose meeting_date is still in
 * the future are returned too — the board shows them as "queued for the next
 * meeting" so whoever logged one can see it landed.
 */
export async function getFeedback(closedDays = 14): Promise<FeedbackItem[]> {
  return query<FeedbackItem>(
    `SELECT id, body, source, audience, meeting_date::text AS meeting_date,
            job_id, job_label, employee_id, employee_name, status,
            closed_at, closed_by_name, author_name, created_at
       FROM morning_meeting_feedback
      WHERE status = 'open'
         OR closed_at >= NOW() - ($1::int * INTERVAL '1 day')
      ORDER BY status DESC, meeting_date ASC, created_at DESC`,
    [closedDays]
  );
}

// ── Culture ──────────────────────────────────────────────────────────────────

/**
 * What may rotate: active, and either a core value (its name alone is worth
 * saying) or anything else that has wording. An empty "Our Mission" card would
 * be a blank slide at 7:15.
 */
const CULTURE_ELIGIBLE_SQL = `(c.active AND (c.kind = 'core_value' OR COALESCE(TRIM(c.body), '') <> ''))`;

const CULTURE_SELECT = `
  SELECT c.id, c.kind, c.title, c.body, c.active, c.sort_order,
         ${CULTURE_ELIGIBLE_SQL}       AS eligible,
         d.last_on::text               AS last_shown_on,
         COALESCE(d.times, 0)::int     AS times_shown
    FROM culture_items c
    LEFT JOIN (
      SELECT culture_item_id, MAX(meeting_date) AS last_on, COUNT(*) AS times
        FROM morning_meeting_culture_days
       WHERE culture_item_id IS NOT NULL
       GROUP BY culture_item_id
    ) d ON d.culture_item_id = c.id`;

/** The whole list, in display order — for the editor and the pin picker. */
export async function getCultureItems(): Promise<CultureItem[]> {
  return query<CultureItem>(`${CULTURE_SELECT} ORDER BY c.sort_order, c.created_at`);
}

/**
 * Today's culture card: whatever is recorded for today, otherwise the eligible
 * item shown longest ago, claimed for today. Same claim-on-first-view and safe
 * race as getPolicyOfDay — a second concurrent viewer cannot overwrite the pick.
 */
export async function getCultureOfDay(today: string): Promise<CultureOfDay> {
  const existing = await queryOne<{ culture_item_id: string | null; pinned: boolean }>(
    'SELECT culture_item_id, pinned FROM morning_meeting_culture_days WHERE meeting_date = $1',
    [today]
  );
  if (existing?.culture_item_id) {
    const item = await queryOne<CultureItem>(`${CULTURE_SELECT} WHERE c.id = $1`, [
      existing.culture_item_id,
    ]);
    // A pick that was since switched off or emptied falls through to a fresh one.
    if (item && (item.eligible || existing.pinned)) {
      return { item, pinned: existing.pinned, empty: false };
    }
  }

  const next = await queryOne<{ id: string }>(
    `SELECT c.id
       FROM culture_items c
       LEFT JOIN (
         SELECT culture_item_id, MAX(meeting_date) AS last_on, COUNT(*) AS times
           FROM morning_meeting_culture_days
          WHERE culture_item_id IS NOT NULL AND meeting_date < $1
          GROUP BY culture_item_id
       ) d ON d.culture_item_id = c.id
      WHERE ${CULTURE_ELIGIBLE_SQL}
      ORDER BY d.last_on ASC NULLS FIRST, d.times ASC NULLS FIRST, c.sort_order, c.created_at
      LIMIT 1`,
    [today]
  );
  if (!next) return { item: null, pinned: false, empty: true };

  // Fills an empty row, or replaces an unpinned pick that is no longer eligible.
  await query(
    `INSERT INTO morning_meeting_culture_days (meeting_date, culture_item_id)
     VALUES ($1, $2)
     ON CONFLICT (meeting_date) DO UPDATE
        SET culture_item_id = EXCLUDED.culture_item_id, updated_at = NOW()
      WHERE morning_meeting_culture_days.pinned = FALSE
        AND morning_meeting_culture_days.culture_item_id IS DISTINCT FROM EXCLUDED.culture_item_id
        AND (morning_meeting_culture_days.culture_item_id IS NULL
             OR NOT EXISTS (SELECT 1 FROM culture_items c
                             WHERE c.id = morning_meeting_culture_days.culture_item_id
                               AND ${CULTURE_ELIGIBLE_SQL}))`,
    [today, next.id]
  );

  const settled = await queryOne<{ culture_item_id: string | null; pinned: boolean }>(
    'SELECT culture_item_id, pinned FROM morning_meeting_culture_days WHERE meeting_date = $1',
    [today]
  );
  const item = await queryOne<CultureItem>(`${CULTURE_SELECT} WHERE c.id = $1`, [
    settled?.culture_item_id ?? next.id,
  ]);
  return { item, pinned: settled?.pinned ?? false, empty: !item };
}

// ── Materials Check ──────────────────────────────────────────────────────────

function n(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function materialsJobLabel(j: { customer: string | null; job_number: string | null; sequence_no: number }): string {
  const who = [j.job_number ? `#${j.job_number}` : null, j.customer].filter(Boolean).join(' · ');
  return who || `Job ${j.sequence_no}`;
}

/**
 * The materials leak check, read before anyone counts today:
 *  - counts: per truck that worked the last working day, the final count
 *    (post_job) from the last job of its previous working day vs. the initial
 *    count (pre_dispatch) from the first job of its latest one, with offloads in
 *    between netted out. Same-day jobs are skipped (their initial is a copy of
 *    the job before), and idle days don't matter. If that earlier sheet was never
 *    closed there is no final count; it is flagged rather than skipped, since an
 *    older count would miss that job's restock.
 *  - charges: for each job on the last working day, used (post_dispatch −
 *    post_job) vs. charged in SmartMoving, for materials the customer pays for
 *    (charge_per_unit > 0 — shrink wrap and tape are free). Charged is
 *    job_counts.charged, the same figure the Leakage report uses.
 */
export async function getMaterialsCheck(today: string): Promise<MaterialsCheck> {
  type JobRow = {
    id: number;
    truck_id: number;
    truck_name: string;
    job_date: string;
    sequence_no: number;
    customer: string | null;
    job_number: string | null;
    status: string;
    created_at: string;
    rn: number;
  };
  // Per active truck, its last two working days before today: rn 1 = the first
  // job of the latest day (a fresh morning count), rn 2 = the last job of the day
  // before that (the final count it parked with). Later jobs on the same day start
  // from a copy of the previous job's final count, so comparing within a day would
  // always show zero.
  const recent = await query<JobRow>(
    `WITH days AS (
        SELECT truck_id, job_date, MIN(sequence_no) AS first_seq, MAX(sequence_no) AS last_seq,
               DENSE_RANK() OVER (PARTITION BY truck_id ORDER BY job_date DESC)::int AS rn
          FROM materials_jobs
         WHERE job_date < $1::date
         GROUP BY truck_id, job_date
     )
     SELECT j.id, j.truck_id, t.name AS truck_name, j.job_date::text AS job_date, j.sequence_no,
            j.customer, j.job_number, j.status, j.created_at, d.rn
       FROM days d
       JOIN materials_jobs j
         ON j.truck_id = d.truck_id AND j.job_date = d.job_date
        AND j.sequence_no = CASE WHEN d.rn = 1 THEN d.first_seq ELSE d.last_seq END
       JOIN trucks t ON t.id = j.truck_id
      WHERE t.active = TRUE AND d.rn <= 2
      ORDER BY t.sort_order, t.name, d.rn`,
    [today]
  );
  if (recent.length === 0) return { jobDay: null, counts: [], charges: [] };

  const jobDay = recent.reduce((d, j) => (j.job_date > d ? j.job_date : d), '');
  const dayJobs = await query<Omit<JobRow, 'created_at' | 'rn'>>(
    `SELECT j.id, j.truck_id, t.name AS truck_name, j.job_date::text AS job_date, j.sequence_no,
            j.customer, j.job_number, j.status
       FROM materials_jobs j
       JOIN trucks t ON t.id = j.truck_id
      WHERE j.job_date = $1::date
      ORDER BY t.sort_order, t.name, j.sequence_no`,
    [jobDay]
  );

  // Only trucks that worked the last working day — an idle truck's check was
  // already walked at an earlier meeting.
  const last = recent.filter((j) => j.rn === 1 && j.job_date === jobDay);
  const priorByTruck = new Map(recent.filter((j) => j.rn === 2).map((j) => [j.truck_id, j]));
  const jobIds = [...new Set([...recent.map((j) => j.id), ...dayJobs.map((j) => j.id)])];

  const [materials, counts, offloads] = await Promise.all([
    query<{ id: number; name: string; charge_per_unit: number | null }>(
      'SELECT id, name, charge_per_unit FROM materials WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{
      job_id: number;
      material_id: number;
      pre_dispatch: number | null;
      post_job: number | null;
      used: number | null;
      charged: number | null;
    }>(
      `SELECT job_id, material_id, pre_dispatch, post_job, used, charged
         FROM job_counts WHERE job_id = ANY($1::int[])`,
      [jobIds]
    ),
    // Offloads from the start of the day of the job two back until the last
    // job's sheet was opened.
    Promise.all(
      last
        .filter((j) => priorByTruck.has(j.truck_id))
        .map((j) =>
          query<{ truck_id: number; material_id: number; qty: number }>(
            `SELECT truck_id, material_id, SUM(qty_delta) AS qty
               FROM inventory_transactions
              WHERE type = 'offload' AND truck_id = $1
                AND created_at >= ($2::date::timestamp AT TIME ZONE 'America/New_York')
                AND created_at < $3
              GROUP BY truck_id, material_id`,
            [j.truck_id, priorByTruck.get(j.truck_id)!.job_date, j.created_at]
          )
        )
    ).then((r) => r.flat()),
  ]);

  const countAt = new Map(counts.map((c) => [`${c.job_id}:${c.material_id}`, c]));
  const offAt = new Map(offloads.map((o) => [`${o.truck_id}:${o.material_id}`, Number(o.qty)]));

  const countChecks: MaterialsCountCheck[] = last.map((j) => {
    const prior = priorByTruck.get(j.truck_id) ?? null;
    const priorClosed = prior?.status === 'complete';
    const lines = materials.map((m) => {
      const priorFinal = prior && priorClosed ? n(countAt.get(`${prior.id}:${m.id}`)?.post_job) : null;
      const offloaded = offAt.get(`${j.truck_id}:${m.id}`) ?? 0;
      const expected = priorFinal == null ? null : priorFinal - offloaded;
      const initial = n(countAt.get(`${j.id}:${m.id}`)?.pre_dispatch);
      return {
        material_id: m.id,
        name: m.name,
        prior_final: priorFinal,
        offloaded,
        expected,
        initial,
        diff: expected == null || initial == null ? null : initial - expected,
      };
    });
    return {
      truck_id: j.truck_id,
      truck_name: j.truck_name,
      last: {
        job_id: j.id,
        job_date: j.job_date,
        job_label: materialsJobLabel(j),
        counted: j.status !== 'draft' && lines.some((l) => l.initial != null),
      },
      prior: prior
        ? { job_id: prior.id, job_date: prior.job_date, job_label: materialsJobLabel(prior), closed: priorClosed }
        : null,
      lines,
    };
  });

  const charged = materials.filter((m) => Number(m.charge_per_unit ?? 0) > 0);
  const charges: MaterialsChargeJob[] = dayJobs.map((j) => ({
    job_id: j.id,
    truck_name: j.truck_name,
    sequence_no: j.sequence_no,
    customer: j.customer,
    job_number: j.job_number,
    status: j.status,
    lines: charged.map((m) => {
      const c = countAt.get(`${j.id}:${m.id}`);
      return {
        material_id: m.id,
        name: m.name,
        used: n(c?.used),
        charged: n(c?.charged),
        charge_per_unit: Number(m.charge_per_unit),
      };
    }),
  }));

  return { jobDay, counts: countChecks, charges };
}
