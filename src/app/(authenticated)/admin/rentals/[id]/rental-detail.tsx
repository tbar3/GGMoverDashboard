'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  RENTAL_STATUS_LABEL,
  type TruckRental,
  type OffloadItem,
  type RentalOffloadState,
} from '@/lib/rentals-shared';
import { updateRental, deleteRental } from '@/lib/rentals-actions';

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const textareaClass =
  'w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * One rental, in full.
 *
 * Reached by clicking any rental on the board, including past ones — the thing
 * you want when a vendor charge turns up weeks later and you need to know what
 * that truck was, who had it, and what was done before it went back.
 */
export default function RentalDetail({
  rental,
  items,
  offload,
}: {
  rental: TruckRental;
  items: OffloadItem[];
  offload: RentalOffloadState | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [vendor, setVendor] = useState(rental.vendor);
  const [vendorRef, setVendorRef] = useState(rental.vendor_ref ?? '');
  const [size, setSize] = useState(rental.size ?? '');
  const [from, setFrom] = useState(rental.needed_from);
  const [to, setTo] = useState(rental.est_return_date);
  const [pickupTime, setPickupTime] = useState(rental.pickup_time ?? '');
  const [rate, setRate] = useState(rental.daily_rate != null ? String(rental.daily_rate) : '');
  const [notes, setNotes] = useState(rental.notes ?? '');
  const [hasRamp, setHasRamp] = useState(rental.has_ramp);
  const [hasLiftgate, setHasLiftgate] = useState(rental.has_liftgate);
  const [isIsuzu, setIsIsuzu] = useState(rental.is_isuzu);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string, after?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      after?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  const checkedIds = new Set(offload?.checks.map((c) => c.item_id) ?? []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/rentals">
          <Button variant="ghost" size="icon" aria-label="Back to rentals">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {rental.vendor}
            {rental.size ? ` ${rental.size}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">
            {formatDate(rental.needed_from, 'MMM d, yyyy')} –{' '}
            {formatDate(rental.est_return_date, 'MMM d, yyyy')}
          </p>
        </div>
        <span className="flex-1" />
        <Badge>{RENTAL_STATUS_LABEL[rental.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Details</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Cancel' : 'Edit'}
              </Button>
              {!confirmingDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Delete for good?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => deleteRental(rental.id), 'Rental deleted', () =>
                        router.push('/admin/rentals')
                      )
                    }
                  >
                    <Check className="h-4 w-4" />
                    Yes
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
                    <X className="h-4 w-4" />
                    No
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Vendor" value={rental.vendor} />
              <Field label="Reservation #" value={rental.vendor_ref ?? '—'} />
              <Field label="Size" value={rental.size ?? '—'} />
              <Field
                label="Daily rate"
                value={rental.daily_rate != null ? `$${rental.daily_rate.toFixed(2)}` : '—'}
              />
              <Field label="Needed from" value={formatDate(rental.needed_from, 'EEE, MMM d, yyyy')} />
              <Field
                label="Back on"
                value={formatDate(rental.est_return_date, 'EEE, MMM d, yyyy')}
              />
              <Field
                label="Pick-up time"
                value={rental.pickup_time ? formatTime(rental.pickup_time) : '—'}
              />
              <Field
                label="Truck has"
                value={
                  [rental.has_ramp && 'Ramp', rental.has_liftgate && 'Liftgate', rental.is_isuzu && 'Isuzu']
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
              <Field label="Materials truck" value={rental.truck_name ?? 'not set up'} />
              <Field
                label="Picked up"
                value={rental.picked_up_at ? formatDate(rental.picked_up_at, 'MMM d, yyyy') : '—'}
              />
              <Field
                label="Returned"
                value={rental.returned_at ? formatDate(rental.returned_at, 'MMM d, yyyy') : '—'}
              />
              <Field label="Logged by" value={`${rental.created_by_name} · ${formatDate(rental.created_at, 'MMM d, yyyy')}`} />
              {rental.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap text-sm">{rental.notes}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Reservation #</Label>
                <Input value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Size</Label>
                <Input value={size} onChange={(e) => setSize(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Daily rate</Label>
                <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>Needed from</Label>
                <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Back on</Label>
                <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Pick-up time</Label>
                <input
                  type="time"
                  className={inputClass}
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Truck has</Label>
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={hasRamp} onCheckedChange={(v) => setHasRamp(v === true)} />
                    Ramp
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasLiftgate}
                      onCheckedChange={(v) => setHasLiftgate(v === true)}
                    />
                    Liftgate
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isIsuzu} onCheckedChange={(v) => setIsIsuzu(v === true)} />
                    Isuzu
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Notes</Label>
                <textarea
                  className={textareaClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  disabled={pending || !vendor.trim()}
                  onClick={() =>
                    run(
                      () =>
                        updateRental({
                          id: rental.id,
                          vendor,
                          vendorRef,
                          size,
                          neededFrom: from,
                          estReturnDate: to,
                          pickupTime,
                          hasRamp,
                          hasLiftgate,
                          isIsuzu,
                          dailyRate: rate ? Number(rate) : null,
                          notes,
                        }),
                      'Saved',
                      () => setEditing(false)
                    )
                  }
                >
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {offload && (
        <Card>
          <CardHeader>
            <CardTitle>Offload checklist</CardTitle>
            <CardDescription>
              {offload.can_return
                ? 'Everything done.'
                : (offload.blocking_reason ?? 'Still outstanding.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {items.map((item) => {
                const check = offload.checks.find((c) => c.item_id === item.id);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <span className={checkedIds.has(item.id) ? '' : 'text-muted-foreground'}>
                      {checkedIds.has(item.id) ? '✓' : '○'} {item.label}
                    </span>
                    {check && (
                      <span className="text-xs text-muted-foreground">
                        {check.checked_by_name} · {formatDate(check.checked_at, 'MMM d')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
