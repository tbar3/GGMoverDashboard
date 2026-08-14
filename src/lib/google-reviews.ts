import { format } from 'date-fns';
import { query, queryOne } from '@/lib/db';
import { getGoogleAuthClient } from '@/lib/google';
import { getStringSetting, setStringSetting } from '@/lib/settings';
import { weekStartOf } from '@/lib/bonus';

/**
 * Auto-import of 5-star Google reviews into the weekly-bonus system.
 *
 * Flow (weekly): fetch 5-star reviews from the GoodGuys Business Profile → store
 * each in `google_reviews` (deduped by Google's review_id) → match the author's
 * name to a job's customer within a lookback window → auto-credit that job's crew
 * as FIVE_STAR_REVIEW positives. Anything not confidently matched is left
 * status='queued' for a back-office admin to assign by hand.
 *
 * Credits reuse the manual group-event write shape (bonus_positives, one row per
 * crew member) but with source='google' and created_by NULL, mirroring the
 * existing auto-strike precedent. The review credits the week it is IMPORTED
 * (effective_date = today) — you can't reopen a closed bonus week — while
 * event_date keeps the real job date.
 */

// The Business Profile location we read reviews for, as "accounts/{a}/locations/{l}".
// Discovered once from the connected Google account and cached in app_settings.
const LOCATION_SETTING_KEY = 'gbp_location_resource';
const MATCH_LOOKBACK_DAYS = 120; // how far before a review to look for its job

type AuthClient = NonNullable<Awaited<ReturnType<typeof getGoogleAuthClient>>>;

export interface ReviewSyncSummary {
  fetched: number; // 5-star reviews returned by Google
  newlyStored: number; // reviews we hadn't seen before
  credited: number; // reviews auto-matched to a job and credited
  queued: number; // reviews left for manual assignment
  errors: string[];
}

// ── Google API shapes (only the fields we use) ─────────────────
interface GoogleReview {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: string; // 'ONE'..'FIVE'
  comment?: string;
  createTime?: string;
  updateTime?: string;
}
const STAR_WORD_TO_NUM: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ── Location discovery ─────────────────────────────────────────

/**
 * The location resource to read reviews for. Cached in app_settings after the
 * first discovery; falls back to listing the connected account's first location.
 */
async function resolveLocationResource(auth: AuthClient): Promise<string | null> {
  const cached = await getStringSetting(LOCATION_SETTING_KEY);
  if (cached) return cached;

  // Account: e.g. "accounts/123456789".
  const accountsRes = await auth.request<{ accounts?: { name: string }[] }>({
    url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
  });
  const account = accountsRes.data.accounts?.[0]?.name;
  if (!account) return null;

  // Location: e.g. "locations/987654321". readMask is required by the API.
  const locsRes = await auth.request<{ locations?: { name: string }[] }>({
    url:
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations` +
      `?readMask=name,title&pageSize=1`,
  });
  const location = locsRes.data.locations?.[0]?.name;
  if (!location) return null;

  const resource = `${account}/${location}`; // accounts/{a}/locations/{l}
  await setStringSetting(LOCATION_SETTING_KEY, resource);
  return resource;
}

// ── Fetch ──────────────────────────────────────────────────────

/** All 5-star reviews for the location, following pagination. */
async function fetchFiveStarReviews(
  auth: AuthClient,
  locationResource: string
): Promise<GoogleReview[]> {
  const out: GoogleReview[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  const MAX_PAGES = 100; // 100 * 50 = 5,000 reviews — a safe ceiling
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${locationResource}/reviews`);
    url.searchParams.set('pageSize', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await auth.request<{ reviews?: GoogleReview[]; nextPageToken?: string }>({
      url: url.toString(),
    });
    for (const r of res.data.reviews ?? []) {
      if (r.reviewId && STAR_WORD_TO_NUM[r.starRating ?? ''] === 5) out.push(r);
    }
    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  return out;
}

// ── Name matching ──────────────────────────────────────────────

function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a review author confidently matches a job's customer name. Exact match,
 * or same surname with a matching first name / first initial (handles "Sarah T."
 * vs "Sarah Thompson"). Deliberately conservative — anything softer goes to the
 * queue rather than crediting the wrong crew.
 */
function isConfidentNameMatch(author: string, customer: string): boolean {
  const a = normalizeName(author);
  const c = normalizeName(customer);
  if (!a || !c) return false;
  if (a === c) return true;

  const at = a.split(' ');
  const ct = c.split(' ');
  if (at.length < 2 || ct.length < 2) return false;

  const aFirst = at[0];
  const aLast = at[at.length - 1];
  const cFirst = ct[0];
  const cLast = ct[ct.length - 1];
  if (aLast !== cLast) return false;
  // Surname matches; accept if first names match or one is an initial of the other.
  return (
    aFirst === cFirst ||
    (aFirst.length === 1 && cFirst.startsWith(aFirst)) ||
    (cFirst.length === 1 && aFirst.startsWith(cFirst))
  );
}

interface JobCandidate {
  id: string;
  date: string;
  customer_name: string | null;
  crew_ids: string[] | null;
}

/** The best job to attribute a review to: latest job in the lookback window whose
 * customer confidently matches the author. Null if none / ambiguous-none. */
async function findMatchingJob(
  authorName: string,
  reviewDate: string
): Promise<JobCandidate | null> {
  const candidates = await query<JobCandidate>(
    `SELECT id, date::text AS date, customer_name, crew_ids
       FROM jobs
      WHERE customer_name IS NOT NULL
        AND date <= $1::date
        AND date >= ($1::date - ($2 || ' days')::interval)
      ORDER BY date DESC`,
    [reviewDate, String(MATCH_LOOKBACK_DAYS)]
  );
  for (const job of candidates) {
    if (job.customer_name && isConfidentNameMatch(authorName, job.customer_name)) {
      return job; // candidates are date-desc, so this is the most recent match
    }
  }
  return null;
}

// ── Credit ─────────────────────────────────────────────────────

/**
 * Write one FIVE_STAR_REVIEW positive per crew member on `job`, crediting the
 * current bonus week. Returns how many crew were credited (0 if the job has no
 * crew — the caller should then queue the review for a roster fix).
 */
async function creditJobCrew(job: JobCandidate, note: string | null): Promise<number> {
  const crew = Array.from(new Set((job.crew_ids ?? []).filter(Boolean)));
  if (crew.length === 0) return 0;

  const effective = todayStr();
  const weekStart = weekStartOf(effective);
  for (const employeeId of crew) {
    await query(
      `INSERT INTO bonus_positives
         (employee_id, week_start, type, event_date, effective_date, job_id, note, source, created_by)
       VALUES ($1, $2, 'FIVE_STAR_REVIEW', $3, $4, $5, $6, 'google', NULL)`,
      [employeeId, weekStart, job.date, effective, job.id, note]
    );
  }
  return crew.length;
}

/** Short, safe note stored on each credited positive so the source is traceable. */
function reviewNote(author: string | null, comment: string | null): string {
  const who = author?.trim() || 'Google review';
  const snippet = comment?.trim().slice(0, 140) ?? '';
  return snippet ? `5★ Google review — ${who}: "${snippet}"` : `5★ Google review — ${who}`;
}

/**
 * Given an already-stored google_reviews row, try to match it to a job and credit
 * that crew; otherwise mark it queued. Shared by the auto-fetch and the manual-add
 * path so both attribute identically. Returns which happened.
 */
async function attributeStoredReview(
  reviewId: string,
  authorName: string | null,
  comment: string | null,
  reviewDate: string
): Promise<'matched' | 'queued'> {
  const job = authorName ? await findMatchingJob(authorName, reviewDate) : null;
  const credited = job ? await creditJobCrew(job, reviewNote(authorName, comment)) : 0;

  if (job && credited > 0) {
    await query(
      `UPDATE google_reviews
          SET status = 'matched', matched_job_id = $2, credited_at = NOW(), updated_at = NOW()
        WHERE review_id = $1`,
      [reviewId, job.id]
    );
    return 'matched';
  }
  // No confident match, or the matched job had no crew → queue for manual assignment.
  await query(
    `UPDATE google_reviews SET status = 'queued', updated_at = NOW() WHERE review_id = $1`,
    [reviewId]
  );
  return 'queued';
}

// ── Orchestration ──────────────────────────────────────────────

/**
 * Full weekly pass: fetch → store (dedup) → match & credit → queue the rest.
 * Returns a summary, or { error } if Google isn't connected / not yet granted
 * Business Profile access (the caller treats that as a soft failure, not a 500).
 */
export async function syncGoogleReviews(): Promise<ReviewSyncSummary | { error: string }> {
  const auth = await getGoogleAuthClient();
  if (!auth) return { error: 'Google not connected. Authorize under Calendar Sync first.' };

  let locationResource: string | null;
  try {
    locationResource = await resolveLocationResource(auth);
  } catch (e) {
    return { error: `Could not read Business Profile location: ${errMsg(e)}` };
  }
  if (!locationResource) return { error: 'No Business Profile location found for this account.' };

  let reviews: GoogleReview[];
  try {
    reviews = await fetchFiveStarReviews(auth, locationResource);
  } catch (e) {
    // Most likely: Business Profile API access not yet granted (0 QPM) → 403.
    return { error: `Could not fetch reviews: ${errMsg(e)}` };
  }

  const summary: ReviewSyncSummary = {
    fetched: reviews.length,
    newlyStored: 0,
    credited: 0,
    queued: 0,
    errors: [],
  };

  for (const r of reviews) {
    try {
      const authorName = r.reviewer?.displayName ?? null;
      const reviewCreatedAt = r.updateTime ?? r.createTime ?? null;

      // Store (or refresh) the review row. Only brand-new rows (status 'pending')
      // get processed for crediting below — already matched/queued rows are left
      // alone so we never double-credit or clobber a manual assignment.
      const upserted = await queryOne<{ status: string; inserted: boolean }>(
        `INSERT INTO google_reviews
           (review_id, author_name, comment, star_rating, review_created_at, status)
         VALUES ($1, $2, $3, 5, $4, 'pending')
         ON CONFLICT (review_id) DO UPDATE
           SET author_name = EXCLUDED.author_name,
               comment = EXCLUDED.comment,
               updated_at = NOW()
         RETURNING status, (xmax = 0) AS inserted`,
        [r.reviewId, authorName, r.comment ?? null, reviewCreatedAt]
      );
      if (!upserted) continue;
      if (upserted.inserted) summary.newlyStored++;
      if (upserted.status !== 'pending') continue; // already handled in a prior run

      const reviewDate = reviewCreatedAt
        ? format(new Date(reviewCreatedAt), 'yyyy-MM-dd')
        : todayStr();

      const outcome = await attributeStoredReview(
        r.reviewId,
        authorName,
        r.comment ?? null,
        reviewDate
      );
      if (outcome === 'matched') summary.credited++;
      else summary.queued++;
    } catch (e) {
      summary.errors.push(`${r.reviewId}: ${errMsg(e)}`);
    }
  }

  return summary;
}

/**
 * Manually attribute a queued review to a job (back-office queue action): credit
 * that job's crew and mark the review matched. Returns the number credited.
 */
export async function creditQueuedReviewToJob(
  reviewRowId: string,
  jobId: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const review = await queryOne<{ review_id: string; author_name: string | null; comment: string | null; status: string }>(
    'SELECT review_id, author_name, comment, status FROM google_reviews WHERE id = $1',
    [reviewRowId]
  );
  if (!review) return { ok: false, error: 'Review not found' };
  if (review.status === 'matched') return { ok: false, error: 'Already credited' };

  const job = await queryOne<JobCandidate>(
    'SELECT id, date::text AS date, customer_name, crew_ids FROM jobs WHERE id = $1',
    [jobId]
  );
  if (!job) return { ok: false, error: 'Job not found' };

  const count = await creditJobCrew(job, reviewNote(review.author_name, review.comment));
  if (count === 0) return { ok: false, error: 'That job has no crew assigned yet — add crew first.' };

  await query(
    `UPDATE google_reviews
        SET status = 'matched', matched_job_id = $2, credited_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [reviewRowId, jobId]
  );
  return { ok: true, count };
}

/** Dismiss a review so it stops showing in the queue (no crew credit). */
export async function dismissReview(reviewRowId: string): Promise<{ ok: boolean; error?: string }> {
  const rows = await query<{ id: string }>(
    `UPDATE google_reviews SET status = 'dismissed', updated_at = NOW()
      WHERE id = $1 AND status <> 'matched'
      RETURNING id`,
    [reviewRowId]
  );
  if (rows.length === 0) return { ok: false, error: 'Review not found or already credited' };
  return { ok: true };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

// ── Read helpers (for the admin queue page) ────────────────────

export interface QueuedReview {
  id: string;
  authorName: string | null;
  comment: string | null;
  reviewCreatedAt: string | null;
}

/** Reviews awaiting manual attribution, newest first. */
export async function getQueuedReviews(): Promise<QueuedReview[]> {
  return query<QueuedReview>(
    `SELECT id, author_name AS "authorName", comment,
            review_created_at::text AS "reviewCreatedAt"
       FROM google_reviews
      WHERE status = 'queued'
      ORDER BY review_created_at DESC NULLS LAST, created_at DESC`
  );
}

export interface CreditedReview {
  id: string;
  authorName: string | null;
  comment: string | null;
  jobId: string | null;
  customer: string | null;
  jobDate: string | null;
  creditedAt: string | null;
  crewNames: string[] | null;
}

/** Recently auto/manually credited reviews with the job + crew they credited. */
export async function getRecentlyCreditedReviews(limit = 30): Promise<CreditedReview[]> {
  return query<CreditedReview>(
    `SELECT r.id, r.author_name AS "authorName", r.comment,
            j.id AS "jobId", j.customer_name AS customer, j.date::text AS "jobDate",
            r.credited_at::text AS "creditedAt",
            (SELECT array_agg(e.name ORDER BY e.name)
               FROM employees e WHERE e.id = ANY(j.crew_ids)) AS "crewNames"
       FROM google_reviews r
       LEFT JOIN jobs j ON j.id = r.matched_job_id
      WHERE r.status = 'matched'
      ORDER BY r.credited_at DESC NULLS LAST
      LIMIT $1`,
    [limit]
  );
}
