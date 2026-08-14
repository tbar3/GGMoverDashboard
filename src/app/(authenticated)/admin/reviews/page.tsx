import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Inbox, CheckCircle2 } from 'lucide-react';
import { getQueuedReviews, getRecentlyCreditedReviews } from '@/lib/google-reviews';
import { SyncReviewsButton, QueueItem } from './reviews-client';

export default async function GoogleReviewsPage() {
  const [queued, credited] = await Promise.all([
    getQueuedReviews(),
    getRecentlyCreditedReviews(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Google Reviews</h1>
          <p className="text-muted-foreground mt-1">
            5-star reviews auto-credit each job&apos;s crew. Anything we can&apos;t match by name
            waits here for you to assign. Runs weekly; use &ldquo;Sync now&rdquo; to pull on demand.
          </p>
        </div>
        <SyncReviewsButton />
      </div>

      {/* Needs attention — unmatched reviews */}
      <Card className={queued.length > 0 ? 'border-amber-500/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            Needs matching
            {queued.length > 0 && (
              <Badge variant="secondary">{queued.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Reviews whose author didn&apos;t confidently match a job. Assign each to the right job to
            credit its crew.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queued.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nothing to match — every review has been credited or dismissed.
            </p>
          ) : (
            <div className="space-y-3">
              {queued.map((r) => (
                <QueueItem key={r.id} review={r} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently credited */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Recently credited
          </CardTitle>
          <CardDescription>
            5-star reviews matched to a job and credited to its crew.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {credited.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No credited reviews yet. Once reviews sync and match a job, they&apos;ll appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {credited.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-medium">{r.authorName || 'Anonymous'}</span>
                      {r.customer && (
                        <span className="text-sm text-muted-foreground">→ {r.customer}</span>
                      )}
                    </div>
                    {r.comment && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Credited{' '}
                      {r.crewNames && r.crewNames.length > 0
                        ? r.crewNames.join(', ')
                        : 'crew'}
                      {r.jobDate &&
                        ` · job ${new Date(`${r.jobDate}T12:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
