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
import {
  Truck,
  CalendarClock,
  AlertTriangle,
  PackageOpen,
  Check,
  X,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import type { RentalBoardData } from '@/lib/rentals';
import type { TruckRental, WarehouseOption } from '@/lib/rentals-shared';
import type { RentalWindow } from '@/lib/rentals-windows';
import {
  createRental,
  bookRental,
  pickUpRental,
  toggleOffloadCheck,
  returnRental,
  cancelRental,
  updateRentalDates,
  setRentalLeadTime,
} from '@/lib/rentals-actions';

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/**
 * The rental board.
 *
 * Reads top to bottom the way the problem actually runs: what we have to book,
 * what is out right now and what it needs before it can go back, what is coming,
 * and the raw forecast underneath.
 */
export default function RentalsBoard({
  data,
  warehouses,
}: {
  data: RentalBoardData;
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      onSuccess?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  const needsBooking = data.windows.filter(
    (w) => w.state === 'book_now' || w.state === 'late'
  );
  const out = data.active.filter((r) => r.status === 'picked_up');
  const upcoming = data.active.filter((r) => r.status === 'planned' || r.status === 'booked');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rental Trucks</h1>
          <p className="text-muted-foreground mt-1">
            {data.capacity} owned truck{data.capacity === 1 ? '' : 's'} · booking{' '}
            {data.leadTimeDays} day{data.leadTimeDays === 1 ? '' : 's'} ahead · next{' '}
            {data.horizonDays} days
            {data.dataAsOf ? ` · schedule synced ${data.dataAsOf}` : ''}
          </p>
        </div>
        <LeadTimeEditor current={data.leadTimeDays} pending={pending} run={run} />
      </div>

      {data.jobsMissingEstimate > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <p>
            {data.jobsMissingEstimate} upcoming job
            {data.jobsMissingEstimate === 1 ? ' has' : 's have'} no truck quoted. Those count as
            zero here, so a day can look covered when it is not.
          </p>
        </div>
      )}

      {/* ── 1. Needs booking ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Needs booking
              </CardTitle>
              <CardDescription>
                Days the schedule needs more trucks than we own, past the point where booking is
                safe.
              </CardDescription>
            </div>
            <NewRentalForm today={data.today} pending={pending} run={run} />
          </div>
        </CardHeader>
        <CardContent>
          {needsBooking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to book. Every day in the next {data.horizonDays} is inside{' '}
              {data.capacity} truck{data.capacity === 1 ? '' : 's'} — or already covered.
            </p>
          ) : (
            <ul className="space-y-2">
              {needsBooking.map((w) => (
                <WindowRow key={w.needed_from} window={w} pending={pending} run={run} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Out now ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Out now
          </CardTitle>
          <CardDescription>
            Everything that has to happen before a truck goes back. The materials line is read from
            what the truck is actually holding, not ticked from memory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {out.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rentals on the road.</p>
          ) : (
            out.map((rental) => (
              <OutRental
                key={rental.id}
                rental={rental}
                data={data}
                pending={pending}
                run={run}
                today={data.today}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── 3. Upcoming ──────────────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Booked and planned
            </CardTitle>
            <CardDescription>Not picked up yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map((rental) => (
              <UpcomingRental
                key={rental.id}
                rental={rental}
                warehouses={warehouses}
                pending={pending}
                run={run}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── 4. The forecast underneath ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Forecast
          </CardTitle>
          <CardDescription>
            Every day in the next {data.horizonDays}, against {data.capacity} owned truck
            {data.capacity === 1 ? '' : 's'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No day in the horizon needs more than we own.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.windows.map((w) => (
                <WindowRow key={w.needed_from} window={w} pending={pending} run={run} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── 5. History ───────────────────────────────────────────────────── */}
      {data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past rentals</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {data.history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {r.status === 'cancelled' ? 'Cancelled' : 'Returned'}
                  </Badge>
                  <span className="font-medium">{r.vendor}</span>
                  <span className="text-muted-foreground">
                    {formatDate(r.needed_from, 'MMM d')} – {formatDate(r.est_return_date, 'MMM d')}
                    {r.truck_name ? ` · ${r.truck_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void
) => void;

/** "08:00" → "8:00 AM". The value is already wall-clock, so no date is involved. */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** What the truck is — shown wherever a crew might need to know before it arrives. */
function SpecBadges({ rental }: { rental: TruckRental }) {
  const specs = [
    rental.has_ramp && 'Ramp',
    rental.has_liftgate && 'Liftgate',
    rental.is_isuzu && 'Isuzu',
  ].filter(Boolean) as string[];

  if (specs.length === 0) return null;

  return (
    <>
      {specs.map((s) => (
        <Badge key={s} variant="secondary" className="text-[10px]">
          {s}
        </Badge>
      ))}
    </>
  );
}

const STATE_LABEL: Record<RentalWindow['state'], { label: string; className: string }> = {
  late: { label: 'Late', className: 'bg-destructive text-destructive-foreground' },
  book_now: { label: 'Book now', className: 'bg-amber-500 text-white' },
  planned: { label: 'Planned', className: '' },
  covered: { label: 'Covered', className: 'bg-emerald-600 text-white' },
};

/** One demand window: what it needs, by when, and until when. */
function WindowRow({
  window,
  pending,
  run,
}: {
  window: RentalWindow;
  pending: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const state = STATE_LABEL[window.state];

  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={state.className}>{state.label}</Badge>
        <span className="font-medium">
          {formatDate(window.needed_from, 'EEE, MMM d')}
          {window.last_needed !== window.needed_from
            ? ` – ${formatDate(window.last_needed, 'EEE, MMM d')}`
            : ''}
        </span>
        <span className="text-muted-foreground">
          needs {window.trucks_needed} extra truck{window.trucks_needed === 1 ? '' : 's'}
          {window.trucks_uncovered > 0 && window.trucks_uncovered !== window.trucks_needed
            ? ` · ${window.trucks_uncovered} still uncovered`
            : ''}
        </span>
        <span className="flex-1" />
        {window.state !== 'covered' && (
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Book a rental'}
          </Button>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Book by {formatDate(window.book_by, 'EEE, MMM d')} · back on{' '}
        {formatDate(window.suggested_return, 'EEE, MMM d')}
      </p>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <QuickBookForm
            neededFrom={window.needed_from}
            estReturnDate={window.suggested_return}
            pending={pending}
            run={run}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

/** Book against a window, with its dates already filled in. */
function QuickBookForm({
  neededFrom,
  estReturnDate,
  pending,
  run,
  onDone,
}: {
  neededFrom: string;
  estReturnDate: string;
  pending: boolean;
  run: Run;
  onDone: () => void;
}) {
  const [vendor, setVendor] = useState('');
  const [vendorRef, setVendorRef] = useState('');
  const [size, setSize] = useState('');
  const [from, setFrom] = useState(neededFrom);
  const [to, setTo] = useState(estReturnDate);
  const [pickupTime, setPickupTime] = useState('');
  const [rate, setRate] = useState('');
  const [hasRamp, setHasRamp] = useState(false);
  const [hasLiftgate, setHasLiftgate] = useState(false);
  const [isIsuzu, setIsIsuzu] = useState(false);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Vendor</Label>
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Penske" />
      </div>
      <div className="space-y-1">
        <Label>Reservation #</Label>
        <Input
          value={vendorRef}
          onChange={(e) => setVendorRef(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-1">
        <Label>Size</Label>
        <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="26'" />
      </div>
      <div className="space-y-1">
        <Label>Daily rate</Label>
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Optional"
          inputMode="decimal"
        />
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
        <p className="text-xs text-muted-foreground">When we collect it. Optional.</p>
      </div>
      <div className="space-y-1">
        <Label>Truck has</Label>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hasRamp} onCheckedChange={(v) => setHasRamp(v === true)} />
            Ramp
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hasLiftgate} onCheckedChange={(v) => setHasLiftgate(v === true)} />
            Liftgate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isIsuzu} onCheckedChange={(v) => setIsIsuzu(v === true)} />
            Isuzu
          </label>
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button
          disabled={pending || !vendor.trim()}
          onClick={() =>
            run(
              () =>
                createRental({
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
                  booked: true,
                }),
              'Rental booked',
              onDone
            )
          }
        >
          Book it
        </Button>
      </div>
    </div>
  );
}

/**
 * Log a rental with no window behind it — a truck in the shop, a last-minute add.
 *
 * `today` comes from the server, in America/New_York. Seeding these from the
 * browser's own clock would put tomorrow's date in the box every evening.
 */
function NewRentalForm({
  today,
  pending,
  run,
}: {
  today: string;
  pending: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Log a rental
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">New rental</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <QuickBookForm
        neededFrom={today}
        estReturnDate={today}
        pending={pending}
        run={run}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}

/** A rental that is out: drift, the checklist, and the gate on returning it. */
function OutRental({
  rental,
  data,
  pending,
  run,
  today,
}: {
  rental: TruckRental;
  data: RentalBoardData;
  pending: boolean;
  run: Run;
  today: string;
}) {
  const state = data.offload[rental.id];
  const drift = data.drift[rental.id];
  const checkedIds = new Set(state?.checks.map((c) => c.item_id) ?? []);
  const overdue = rental.est_return_date < today;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{rental.vendor}</span>
        {rental.size && <Badge variant="secondary">{rental.size}</Badge>}
        {rental.truck_name && (
          <Badge variant="outline" className="text-[10px]">
            {rental.truck_name}
          </Badge>
        )}
        <SpecBadges rental={rental} />
        <span className="text-sm text-muted-foreground">
          due back {formatDate(rental.est_return_date, 'EEE, MMM d')}
        </span>
        {overdue && <Badge className="bg-destructive text-destructive-foreground">Overdue</Badge>}
      </div>

      {drift && drift.kind !== 'none' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>
            {drift.kind === 'extend'
              ? `The schedule now needs trucks ${drift.days} day${drift.days === 1 ? '' : 's'} longer.`
              : `Could go back ${drift.days} day${drift.days === 1 ? '' : 's'} early.`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updateRentalDates({
                    id: rental.id,
                    neededFrom: rental.needed_from,
                    estReturnDate: drift.suggested_return,
                  }),
                'Return date moved'
              )
            }
          >
            Move to {formatDate(drift.suggested_return, 'MMM d')}
          </Button>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {data.items.map((item) => {
          const isMaterials = item.system_key === 'materials_offloaded';
          const blocked = isMaterials && (state?.materials_remaining ?? 0) > 0;
          return (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checkedIds.has(item.id)}
                disabled={pending || blocked}
                onCheckedChange={(checked) =>
                  run(
                    () =>
                      toggleOffloadCheck({
                        rentalId: rental.id,
                        itemId: item.id,
                        checked: checked === true,
                      }),
                    checked === true ? 'Ticked' : 'Unticked'
                  )
                }
              />
              <span className={blocked ? 'text-muted-foreground' : ''}>{item.label}</span>
              {isMaterials && (state?.materials_remaining ?? 0) > 0 && rental.truck_id && (
                <Link
                  href={`/materials/offload?truck=${rental.truck_id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  <PackageOpen className="h-3.5 w-3.5" />
                  {state?.materials_remaining} still on board — offload
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !state?.can_return}
          onClick={() => run(() => returnRental(rental.id), 'Returned — truck off the count sheets')}
        >
          <Check className="h-4 w-4" />
          Mark returned
        </Button>
        {state?.blocking_reason && (
          <span className="text-xs text-muted-foreground">{state.blocking_reason}</span>
        )}
      </div>
    </div>
  );
}

/** A booked or planned rental, and the pickup that turns it into a working truck. */
function UpcomingRental({
  rental,
  warehouses,
  pending,
  run,
}: {
  rental: TruckRental;
  warehouses: WarehouseOption[];
  pending: boolean;
  run: Run;
}) {
  const [truckName, setTruckName] = useState(
    `${rental.vendor}${rental.size ? ` ${rental.size}` : ''} (rental)`
  );
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? 0);

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rental.status === 'booked' ? 'default' : 'outline'}>
          {rental.status === 'booked' ? 'Booked' : 'Planned'}
        </Badge>
        <span className="font-medium">{rental.vendor}</span>
        <span className="text-muted-foreground">
          {formatDate(rental.needed_from, 'MMM d')}
          {rental.pickup_time ? ` at ${formatTime(rental.pickup_time)}` : ''} –{' '}
          {formatDate(rental.est_return_date, 'MMM d')}
          {rental.vendor_ref ? ` · #${rental.vendor_ref}` : ''}
        </span>
        <SpecBadges rental={rental} />
        <span className="flex-1" />
        {rental.status === 'planned' && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => bookRental({ id: rental.id }), 'Marked as booked')}
          >
            Mark booked
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => cancelRental(rental.id), 'Cancelled')}
        >
          Cancel
        </Button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Truck name (crews will see this)</Label>
          <Input value={truckName} onChange={(e) => setTruckName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Home warehouse</Label>
          <select
            className={inputClass}
            value={warehouseId}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            disabled={pending || !truckName.trim() || !warehouseId}
            onClick={() =>
              run(
                () => pickUpRental({ id: rental.id, truckName, warehouseId }),
                'Picked up — crews can load it now'
              )
            }
          >
            <Truck className="h-4 w-4" />
            Picked up
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Book-by lead time lives here, where the dates it moves are visible. */
function LeadTimeEditor({
  current,
  pending,
  run,
}: {
  current: number;
  pending: boolean;
  run: Run;
}) {
  const [days, setDays] = useState(String(current));

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Book this many days ahead</Label>
        <Input
          className="w-24"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || days === String(current) || !days.trim()}
        onClick={() => run(() => setRentalLeadTime(Number(days)), 'Lead time saved')}
      >
        Save
      </Button>
    </div>
  );
}
