'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { QueuedReview } from '@/lib/google-reviews';
import { syncReviewsAction, assignReviewAction, dismissReviewAction } from './actions';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface JobOption {
  id: string;
  jobNumber: string | null;
  customer: string | null;
  startTime: string | null;
  crew: { id: string; name: string }[];
}

/** "Sync now" — pulls reviews from Google on demand (weekly cron does this too). */
export function SyncReviewsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await syncReviewsAction();
      if (!res.ok) {
        toast.error(res.error || 'Sync failed');
      } else {
        toast.success(
          `Fetched ${res.fetched} · credited ${res.credited} · queued ${res.queued}`
        );
        router.refresh();
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
      {busy ? 'Syncing…' : 'Sync now'}
    </Button>
  );
}

/** One queued review with a date + job picker to attribute it to a job's crew. */
export function QueueItem({ review }: { review: QueuedReview }) {
  const router = useRouter();
  const [date, setDate] = useState(review.reviewCreatedAt?.slice(0, 10) || todayStr());
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingJobs(true);
      setJobId('');
      try {
        const res = await fetch(`/api/jobs/by-date?date=${date}`);
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setJobs(data);
      } catch {
        if (!cancelled) setJobs([]);
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function assign() {
    if (!jobId) {
      toast.error('Pick a job first');
      return;
    }
    setBusy(true);
    try {
      const res = await assignReviewAction(review.id, jobId);
      if (!res.ok) toast.error(res.error || 'Could not assign');
      else {
        toast.success(`Credited ${res.count} crew member${res.count === 1 ? '' : 's'}`);
        router.refresh();
      }
    } catch {
      toast.error('Could not assign');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      const res = await dismissReviewAction(review.id);
      if (!res.ok) toast.error(res.error || 'Could not dismiss');
      else {
        toast.success('Dismissed');
        router.refresh();
      }
    } catch {
      toast.error('Could not dismiss');
    } finally {
      setBusy(false);
    }
  }

  const selectedJob = jobs.find((j) => j.id === jobId);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <p className="font-medium">{review.authorName || 'Anonymous reviewer'}</p>
        {review.comment && (
          <p className="text-sm text-muted-foreground mt-0.5">&ldquo;{review.comment}&rdquo;</p>
        )}
        {review.reviewCreatedAt && (
          <p className="text-xs text-muted-foreground/70 mt-1">
            Left {new Date(review.reviewCreatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Job date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1 min-w-[220px] flex-1">
          <label className="text-xs font-medium text-muted-foreground">Job</label>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={loadingJobs}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">
              {loadingJobs ? 'Loading jobs…' : jobs.length ? 'Select a job…' : 'No jobs on this date'}
            </option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.customer || 'Customer'}
                {j.jobNumber ? ` · #${j.jobNumber}` : ''}
                {j.crew.length ? ` · ${j.crew.map((c) => c.name).join(', ')}` : ' · no crew'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button onClick={assign} disabled={busy || !jobId}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Credit crew
          </Button>
          <Button variant="ghost" onClick={dismiss} disabled={busy} aria-label="Dismiss review">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedJob && selectedJob.crew.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          This job has no crew assigned — add crew on the job first, or pick another job.
        </p>
      )}
    </div>
  );
}
