'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import { AttachmentPanel } from '@/components/compliance/attachment-panel';
import { recordRenewal, deleteRenewal, deleteItem } from '@/lib/compliance/actions';
import { addMonths, todayLocalIso } from '@/lib/compliance/status';
import {
  categoryLabel,
  type ComplianceAttachment,
  type ComplianceItemRow,
  type ComplianceRenewal,
} from '@/lib/compliance/types';

export default function ItemDetail({
  item,
  renewals,
  attachments,
  storageReady,
}: {
  item: ComplianceItemRow;
  renewals: ComplianceRenewal[];
  attachments: ComplianceAttachment[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renewOpen, setRenewOpen] = useState(false);

  /**
   * Prefill the renewal dialog.
   *
   * The new period starts today and runs one cadence from the CURRENT expiration
   * — not from today. Renewing three days early must not quietly shorten the
   * policy by three days every year.
   */
  function initialRenewal() {
    const today = todayLocalIso();
    const base = item.expiration_date?.slice(0, 10) ?? today;
    return {
      issueDate: today,
      expirationDate: item.cadence_months ? addMonths(base, item.cadence_months) : '',
      completedOn: today,
      cost: item.cost != null ? String(item.cost) : '',
      confirmationNumber: '',
      notes: '',
    };
  }

  const [renewal, setRenewal] = useState(initialRenewal);

  function openRenew() {
    setRenewal(initialRenewal());
    setRenewOpen(true);
  }

  function submitRenewal(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await recordRenewal({
        itemId: item.id,
        issueDate: renewal.issueDate || null,
        expirationDate: renewal.expirationDate || null,
        completedOn: renewal.completedOn,
        cost: renewal.cost ? Number(renewal.cost) : null,
        confirmationNumber: renewal.confirmationNumber,
        notes: renewal.notes,
      });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      toast.success('Renewal recorded');
      setRenewOpen(false);
      router.refresh();
    });
  }

  function removeRenewal(r: ComplianceRenewal) {
    if (!window.confirm('Delete this renewal record? The item’s dates are left as they are.')) {
      return;
    }
    startTransition(async () => {
      const result = await deleteRenewal(r.id, item.id);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      toast.success('Renewal deleted');
      router.refresh();
    });
  }

  function removeItem() {
    const warning = attachments.length
      ? `Delete "${item.name}"? Its renewal history and ${attachments.length} file(s) are removed permanently. Archiving keeps all of it.`
      : `Delete "${item.name}"? Its renewal history is removed permanently. Archiving keeps it.`;
    if (!window.confirm(warning)) return;
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      toast.success('Item deleted');
      router.push('/admin/compliance/items');
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/admin/compliance/items">
            <ArrowLeft className="h-4 w-4" />
            All items
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{item.name}</h1>
              <StateBadge state={item.state} daysUntil={item.days_until} />
              {item.status !== 'active' && (
                <Badge variant="secondary">
                  {item.status === 'archived' ? 'Archived' : 'Not applicable'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {categoryLabel(item.category)}
              {item.issuing_authority && ` · ${item.issuing_authority}`}
            </p>
          </div>
          <div className="flex gap-2">
            {item.external_url && (
              <Button variant="outline" asChild>
                <a href={item.external_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Renewal portal
                </a>
              </Button>
            )}
            <Button onClick={openRenew}>
              <CheckCircle2 className="h-4 w-4" />
              Record renewal
            </Button>
          </div>
        </div>
      </div>

      {item.needs_review && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              This one still needs a look
            </CardTitle>
            <CardDescription>
              It was seeded from what a Georgia household-goods mover typically owes, not from your
              filings. Fill in the real dates and numbers — saving from the items list clears this.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="Applies to">
              {item.entity_type === 'company'
                ? 'The company'
                : item.vehicle_name ?? item.entity_employee_name ?? '—'}
            </Detail>
            <Detail label="Responsible for renewal">
              {item.owner_name ?? <span className="text-destructive">Unassigned</span>}
            </Detail>
            <Detail label="Policy / permit number">
              {item.identifier ? <span className="font-mono">{item.identifier}</span> : '—'}
            </Detail>
            <Detail label="Issued">
              {item.issue_date ? formatDate(item.issue_date, 'MMM d, yyyy') : '—'}
            </Detail>
            <Detail label="Expires">
              {item.expiration_date ? formatDate(item.expiration_date, 'MMM d, yyyy') : 'Never'}
            </Detail>
            <Detail label="Renews">
              {item.cadence_months ? `Every ${item.cadence_months} months` : 'One-time / as needed'}
            </Detail>
            <Detail label="Warning window">{item.lead_time_days} days ahead</Detail>
            <Detail label="Cost">
              {item.cost != null ? `$${Number(item.cost).toFixed(2)}` : '—'}
            </Detail>
            {item.notes && (
              <div>
                <p className="text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-foreground">{item.notes}</p>
              </div>
            )}
            <div className="pt-2">
              <Button variant="ghost" size="sm" onClick={removeItem} disabled={pending}>
                <Trash2 className="h-4 w-4 text-destructive" />
                Delete item
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Renewal history</CardTitle>
              <CardDescription>
                Every cycle that has been filed, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Completed</TableHead>
                      <TableHead>Good through</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Confirmation</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renewals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No renewals recorded yet. Record one when you file it and the dates above
                          move forward on their own.
                        </TableCell>
                      </TableRow>
                    ) : (
                      renewals.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">
                            {formatDate(r.completed_on, 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.expiration_date ? formatDate(r.expiration_date, 'MMM d, yyyy') : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.cost != null ? `$${Number(r.cost).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.confirmation_number ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.completed_by_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete renewal"
                              disabled={pending}
                              onClick={() => removeRenewal(r)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <AttachmentPanel
                parentKind="item"
                parentId={item.id}
                attachments={attachments}
                storageReady={storageReady}
                title="Certificates & documents"
                description="Stored privately. Only back office can open these."
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record renewal</DialogTitle>
            <DialogDescription>
              This logs the cycle and moves the item&apos;s dates forward.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRenewal} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="r-issue">New issue date</Label>
                <Input
                  id="r-issue"
                  type="date"
                  value={renewal.issueDate}
                  onChange={(e) => setRenewal({ ...renewal, issueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-exp">Good through</Label>
                <Input
                  id="r-exp"
                  type="date"
                  value={renewal.expirationDate}
                  onChange={(e) => setRenewal({ ...renewal, expirationDate: e.target.value })}
                />
                {item.cadence_months && (
                  <p className="text-xs text-muted-foreground">
                    Prefilled {item.cadence_months} months past the old expiration.
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="r-completed">Filed on</Label>
                <Input
                  id="r-completed"
                  type="date"
                  value={renewal.completedOn}
                  onChange={(e) => setRenewal({ ...renewal, completedOn: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-cost">Cost</Label>
                <Input
                  id="r-cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={renewal.cost}
                  onChange={(e) => setRenewal({ ...renewal, cost: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-conf">Confirmation number</Label>
              <Input
                id="r-conf"
                value={renewal.confirmationNumber}
                onChange={(e) => setRenewal({ ...renewal, confirmationNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-notes">Notes</Label>
              <textarea
                id="r-notes"
                rows={2}
                value={renewal.notes}
                onChange={(e) => setRenewal({ ...renewal, notes: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Record renewal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}
