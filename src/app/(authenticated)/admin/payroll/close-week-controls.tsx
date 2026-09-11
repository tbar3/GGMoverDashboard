'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Lock, LockOpen, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { closePayrollWeek, reopenPayrollWeek } from '@/lib/payroll-close';

export function CloseWeekControls({
  weekStart,
  closed,
  bonusApproved,
  bonusWeekStatus,
}: {
  weekStart: string;
  closed: {
    version: number;
    closedAt: string;
    closedByName: string;
    grossPayroll: number;
    note: string | null;
  } | null;
  bonusApproved: boolean;
  bonusWeekStatus: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  function doClose() {
    startTransition(async () => {
      const result = await closePayrollWeek(weekStart, note);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 10000 });
        return;
      }
      toast.success('Week closed — figures are frozen');
      setCloseOpen(false);
      setNote('');
      router.refresh();
    });
  }

  function doReopen() {
    startTransition(async () => {
      const result = await reopenPayrollWeek(weekStart, reason);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 10000 });
        return;
      }
      toast.success('Week re-opened — the previous version is kept');
      setReopenOpen(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <>
      <Card className={closed ? 'border-emerald-500/40 bg-emerald-500/5' : undefined}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-start gap-3">
            {closed ? (
              <Lock className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <LockOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium text-foreground">
                {closed ? 'Closed' : 'Open'}
                {closed && closed.version > 1 && (
                  <Badge variant="secondary" className="ml-2">v{closed.version}</Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {closed ? (
                  <>
                    ${closed.grossPayroll.toFixed(2)} gross · frozen by {closed.closedByName} on{' '}
                    {formatDate(closed.closedAt, 'MMM d, yyyy')}
                    {closed.note ? ` · ${closed.note}` : ''}
                  </>
                ) : (
                  'Figures still recalculate from live data. Close the week to freeze them.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/payroll/export/workbook?week=${weekStart}`}>
                <Download className="h-4 w-4" />
                Export week
              </a>
            </Button>
            {closed ? (
              <Button variant="outline" onClick={() => setReopenOpen(true)} disabled={pending}>
                <LockOpen className="h-4 w-4" />
                Re-open
              </Button>
            ) : (
              <Button onClick={() => setCloseOpen(true)} disabled={pending || !bonusApproved}>
                <Lock className="h-4 w-4" />
                Close week
              </Button>
            )}
          </div>
        </CardContent>

        {!closed && !bonusApproved && (
          <CardContent className="pt-0">
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The weekly bonus for this week is{' '}
                {bonusWeekStatus === 'open' ? 'still open' : 'not set up yet'}, so the bonus figures
                below are provisional and can still change. Approve the bonus week on{' '}
                <a href="/admin/performance" className="underline">Performance</a> before closing
                payroll.
              </span>
            </p>
          </CardContent>
        )}
      </Card>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Close this payroll week?</DialogTitle>
            <DialogDescription>
              This snapshots every line as it stands right now. From then on the run, the export and
              the history all read that snapshot — later edits to hours, strikes, or bonuses will not
              change what this week says it paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              The weekly bonus is approved, so the bonus amounts are taken from the locked results
              rather than a live recalculation.
            </p>
            <div className="space-y-2">
              <Label htmlFor="close-note">Note (optional)</Label>
              <Input
                id="close-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything worth remembering about this week"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button onClick={doClose} disabled={pending}>
              {pending ? 'Closing…' : 'Close week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Re-open this week?</DialogTitle>
            <DialogDescription>
              The closed version is kept, not deleted. When you close again it is saved as the next
              version alongside it, so both figures and your reason stay on the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Why are you re-opening it?</Label>
            <Input
              id="reopen-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Missed warehouse hours for two people"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button onClick={doReopen} disabled={pending || !reason.trim()}>
              {pending ? 'Re-opening…' : 'Re-open week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
