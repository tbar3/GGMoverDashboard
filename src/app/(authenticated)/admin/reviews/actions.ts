'use server';

import { revalidatePath } from 'next/cache';
import { requireBackOffice } from '@/lib/auth';
import {
  syncGoogleReviews,
  creditQueuedReviewToJob,
  dismissReview,
  type ReviewSyncSummary,
} from '@/lib/google-reviews';

// Back-office actions for the Google-reviews queue. Each self-guards; the lib
// functions do the DB work.

export async function syncReviewsAction(): Promise<
  (ReviewSyncSummary & { ok: true }) | { ok: false; error: string }
> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const result = await syncGoogleReviews();
  revalidatePath('/admin/reviews');
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, ...result };
}

export async function assignReviewAction(
  reviewRowId: string,
  jobId: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!reviewRowId || !jobId) return { ok: false, error: 'Pick a job' };

  const res = await creditQueuedReviewToJob(reviewRowId, jobId);
  revalidatePath('/admin/reviews');
  revalidatePath('/admin/performance');
  return res;
}

export async function dismissReviewAction(
  reviewRowId: string
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const res = await dismissReview(reviewRowId);
  revalidatePath('/admin/reviews');
  return res;
}
