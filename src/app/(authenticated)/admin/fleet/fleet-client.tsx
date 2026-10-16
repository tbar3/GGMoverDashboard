'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Link2, Wrench, ChevronUp, ChevronDown, CalendarSearch, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import {
  saveVehicle,
  addVehicleFromTruck,
  moveVehicle,
  addCalendarName,
  type VehicleInput,
} from '@/lib/compliance/vehicle-actions';
import type { FleetChecklistRow } from '@/lib/compliance/checklists';
import { FleetChecklist } from './fleet-checklist';
import { serviceTypeLabel, VEHICLE_TYPES, OWNERSHIP_TYPES, type PmScheduleRow, type VehicleRow } from '@/lib/compliance/types';

type FormState = {
  name: string;
  vehicleType: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  licensePlate: string;
  plateState: string;
  gvwrLbs: string;
  isCmv: boolean;
  ownership: string;
  motiveVehicleId: string;
  inServiceDate: string;
  active: boolean;
  notes: string;
  onTruckSheets: boolean;
  warehouseId: string;
  /** Comma-separated in the form; an array on the record. */
  calendarNames: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    vehicleType: 'box_truck',
    year: '',
    make: '',
    model: '',
    vin: '',
    licensePlate: '',
    plateState: 'GA',
    gvwrLbs: '',
    isCmv: true,
    ownership: 'owned',
    motiveVehicleId: '',
    inServiceDate: '',
    active: true,
    notes: '',
    onTruckSheets: true,
    warehouseId: '',
    calendarNames: '',
  };
}

const RENTAL_STATUS: Record<string, string> = {
  picked_up: 'Out now',
  returned: 'Returned',
  booked: 'Booked',
  planned: 'Planned',
  cancelled: 'Cancelled',
};

export default function FleetClient({
  vehicles,
  unlinkedTrucks,
  pmSchedules,
  checklist,
  warehouses,
  unmatchedCalendarNames,
  storageReady,
}: {
  vehicles: VehicleRow[];
  unlinkedTrucks: { id: number; name: string }[];
  pmSchedules: PmScheduleRow[];
  checklist: FleetChecklistRow[];
  warehouses: { id: number; name: string }[];
  unmatchedCalendarNames: { name: string; jobs: number }[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Rentals are run from the Rental Trucks board; they are listed apart so the
  // fleet list is the trucks we keep.
  const fleet = vehicles.filter((v) => v.ownership !== 'rented');
  const rentals = vehicles.filter((v) => v.ownership === 'rented');
  // Only trucks on the count sheets have an order; the arrows move among those.
  const ordered = fleet.filter((v) => v.truck_id !== null && v.truck_active);
  const isRental = editing?.ownership === 'rented';

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm(), warehouseId: warehouses[0] ? String(warehouses[0].id) : '' });
    setDialogOpen(true);
  }

  function openEdit(vehicle: VehicleRow) {
    setEditing(vehicle);
    setForm({
      name: vehicle.name,
      vehicleType: vehicle.vehicle_type,
      year: vehicle.year != null ? String(vehicle.year) : '',
      make: vehicle.make ?? '',
      model: vehicle.model ?? '',
      vin: vehicle.vin ?? '',
      licensePlate: vehicle.license_plate ?? '',
      plateState: vehicle.plate_state,
      gvwrLbs: vehicle.gvwr_lbs != null ? String(vehicle.gvwr_lbs) : '',
      isCmv: vehicle.is_cmv,
      ownership: vehicle.ownership,
      motiveVehicleId: vehicle.motive_vehicle_id ?? '',
      inServiceDate: vehicle.in_service_date?.slice(0, 10) ?? '',
      active: vehicle.active,
      notes: vehicle.notes ?? '',
      onTruckSheets: vehicle.truck_id !== null && vehicle.truck_active !== false,
      warehouseId: String(vehicle.truck_warehouse_id ?? warehouses[0]?.id ?? ''),
      calendarNames: (vehicle.calendar_names ?? []).join(', '),
    });
    setDialogOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: VehicleInput = {
      id: editing?.id,
      name: form.name,
      vehicleType: form.vehicleType,
      year: form.year ? Number(form.year) : null,
      make: form.make,
      model: form.model,
      vin: form.vin,
      licensePlate: form.licensePlate,
      plateState: form.plateState,
      gvwrLbs: form.gvwrLbs ? Number(form.gvwrLbs) : null,
      isCmv: form.isCmv,
      ownership: form.ownership,
      motiveVehicleId: form.motiveVehicleId,
      inServiceDate: form.inServiceDate || null,
      active: form.active,
      notes: form.notes,
      onTruckSheets: form.onTruckSheets,
      warehouseId: form.warehouseId ? Number(form.warehouseId) : null,
      calendarNames: form.calendarNames.split(','),
    };
    startTransition(async () => {
      const result = await saveVehicle(payload);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      toast.success(editing ? 'Vehicle updated' : 'Vehicle added');
      setDialogOpen(false);
      setEditing(null);
      router.refresh();
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      if (okMessage) toast.success(okMessage);
      router.refresh();
    });
  }

  function linkTruck(truckId: number, name: string) {
    startTransition(async () => {
      const result = await addVehicleFromTruck(truckId);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      toast.success(`${name} added to the fleet`);
      router.refresh();
    });
  }

  const pmByVehicle = new Map<string, PmScheduleRow[]>();
  for (const schedule of pmSchedules) {
    const list = pmByVehicle.get(schedule.vehicle_id) ?? [];
    list.push(schedule);
    pmByVehicle.set(schedule.vehicle_id, list);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet</h1>
          <p className="text-muted-foreground mt-1">
            Every truck we run, in one place — its paperwork and maintenance, its spot on the
            Materials count sheets, and the names the calendar uses for it on jobs.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add vehicle
        </Button>
      </div>

      {unlinkedTrucks.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Trucks not in the fleet yet
            </CardTitle>
            <CardDescription>
              These are on the Materials count sheets but have no fleet record, so nothing tracks
              their registration or maintenance. Add each one to link it — a fleet vehicle with
              the same name is linked rather than duplicated.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unlinkedTrucks.map((truck) => (
              <Button
                key={truck.id}
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => linkTruck(truck.id, truck.name)}
              >
                <Plus className="h-4 w-4" />
                {truck.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {unmatchedCalendarNames.length > 0 && (
        <UnmatchedCalendarNames
          names={unmatchedCalendarNames}
          vehicles={vehicles.filter((v) => v.active)}
          pending={pending}
          onAssign={(vehicleId, name, vehicleName) =>
            act(() => addCalendarName(vehicleId, name), `"${name}" now means ${vehicleName}`)
          }
        />
      )}

      <FleetChecklist rows={checklist} storageReady={storageReady} />

      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
          <CardDescription>
            Owned and leased. Status is the worst of the vehicle&apos;s compliance items and
            maintenance schedules. The arrows set the order crews see trucks on the count sheets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Materials</TableHead>
                  <TableHead>Plate / VIN</TableHead>
                  <TableHead>Odometer</TableHead>
                  <TableHead>PM due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fleet.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No vehicles yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  fleet.map((vehicle) => {
                    const position = ordered.findIndex((v) => v.id === vehicle.id);
                    const due = (pmByVehicle.get(vehicle.id) ?? []).filter(
                      (s) => s.state === 'expired' || s.state === 'due_soon'
                    );
                    return (
                      <TableRow key={vehicle.id} className={vehicle.active ? '' : 'opacity-60'}>
                        <TableCell>
                          <Link
                            href={`/admin/fleet/${vehicle.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {vehicle.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                              'Details not filled in'}
                            {!vehicle.active && ' · Inactive'}
                            {vehicle.ownership === 'leased' && ' · Leased'}
                          </p>
                          {vehicle.calendar_names?.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Calendar: {vehicle.calendar_names.join(', ')}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {vehicle.truck_id !== null && vehicle.truck_active ? (
                            vehicle.warehouse_name ?? 'No warehouse'
                          ) : (
                            <span className="text-muted-foreground">Not on count sheets</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {vehicle.license_plate ? (
                            <span className="font-mono">
                              {vehicle.license_plate} ({vehicle.plate_state})
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {vehicle.vin && (
                            <p className="font-mono text-xs text-muted-foreground">{vehicle.vin}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {vehicle.current_odometer != null ? (
                            <>
                              {vehicle.current_odometer.toLocaleString()} mi
                              <p className="text-xs text-muted-foreground">
                                {formatDate(vehicle.odometer_updated_on, 'MMM d, yyyy')}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No reading</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {due.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Wrench className="h-3 w-3" />
                              {due.map((s) => serviceTypeLabel(s.service_type, s.custom_label)).join(', ')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StateBadge state={vehicle.worst_state} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {position >= 0 && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Move ${vehicle.name} up`}
                                disabled={pending || position === 0}
                                onClick={() => act(() => moveVehicle(vehicle.id, 'up'))}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Move ${vehicle.name} down`}
                                disabled={pending || position === ordered.length - 1}
                                onClick={() => act(() => moveVehicle(vehicle.id, 'down'))}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${vehicle.name}`}
                            onClick={() => openEdit(vehicle)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {rentals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Rental trucks
            </CardTitle>
            <CardDescription>
              Added to the count sheets when picked up and taken off when returned — both on the{' '}
              <Link href="/admin/rentals" className="underline">
                Rental Trucks board
              </Link>
              , which won&apos;t let one go back with materials still on it. Edit here only for
              plate and paperwork.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {rentals.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    vehicle.active ? '' : 'opacity-60'
                  }`}
                >
                  <Link
                    href={`/admin/fleet/${vehicle.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {vehicle.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {vehicle.rental_status
                      ? RENTAL_STATUS[vehicle.rental_status] ?? vehicle.rental_status
                      : vehicle.active
                        ? 'Active'
                        : 'Inactive'}
                    {vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}
                    {vehicle.active && vehicle.warehouse_name ? ` · ${vehicle.warehouse_name}` : ''}
                  </span>
                  <span className="flex-1" />
                  {vehicle.rental_id && (
                    <Link
                      href={`/admin/rentals/${vehicle.rental_id}`}
                      className="text-xs text-primary underline"
                    >
                      Open rental
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${vehicle.name}`}
                    onClick={() => openEdit(vehicle)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add vehicle'}</DialogTitle>
            <DialogDescription>
              {isRental
                ? 'A rental — picked up and returned on the Rental Trucks board. Only its details are edited here.'
                : 'Trailers belong here too — they carry registrations of their own. Rentals are added from the Rental Trucks board.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="v-name">Name</Label>
                <Input
                  id="v-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  What crews see on the count sheets. Renaming here renames it in Materials too.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.vehicleType} onValueChange={(v) => set('vehicleType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="v-year">Year</Label>
                <Input
                  id="v-year"
                  type="number"
                  value={form.year}
                  onChange={(e) => set('year', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-make">Make</Label>
                <Input id="v-make" value={form.make} onChange={(e) => set('make', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-model">Model</Label>
                <Input id="v-model" value={form.model} onChange={(e) => set('model', e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="v-vin">VIN</Label>
                <Input id="v-vin" value={form.vin} onChange={(e) => set('vin', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-gvwr">GVWR (lbs)</Label>
                <Input
                  id="v-gvwr"
                  type="number"
                  value={form.gvwrLbs}
                  onChange={(e) => set('gvwrLbs', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="v-plate">License plate</Label>
                <Input
                  id="v-plate"
                  value={form.licensePlate}
                  onChange={(e) => set('licensePlate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-state">State</Label>
                <Input
                  id="v-state"
                  maxLength={2}
                  value={form.plateState}
                  onChange={(e) => set('plateState', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ownership</Label>
                <Select
                  value={form.ownership}
                  onValueChange={(v) => set('ownership', v)}
                  disabled={isRental}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OWNERSHIP_TYPES.filter((o) => isRental || o.value !== 'rented').map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-inservice">In service since</Label>
                <Input
                  id="v-inservice"
                  type="date"
                  value={form.inServiceDate}
                  onChange={(e) => set('inServiceDate', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v-motive">Motive vehicle ID</Label>
              <Input
                id="v-motive"
                value={form.motiveVehicleId}
                onChange={(e) => set('motiveVehicleId', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Reserved for pulling odometer readings from Motive automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isCmv}
                  onCheckedChange={(v) => set('isCmv', v === true)}
                />
                Commercial motor vehicle
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.active}
                  disabled={isRental}
                  onCheckedChange={(v) => set('active', v === true)}
                />
                Active
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Marking it a CMV is what says the DOT annual inspection and driver qualification rules
              apply — usually anything over 10,000 lbs GVWR.
            </p>

            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Materials &amp; jobs</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.onTruckSheets}
                  disabled={isRental}
                  onCheckedChange={(v) => set('onTruckSheets', v === true)}
                />
                On the Materials count sheets
              </label>
              <p className="text-xs text-muted-foreground">
                Crews load and count materials on it. Leave off for trailers and anything that
                doesn&apos;t carry stock. A truck can&apos;t come off while materials are still on
                it.
              </p>
              {form.onTruckSheets && (
                <div className="space-y-2">
                  <Label>Home warehouse</Label>
                  <Select value={form.warehouseId} onValueChange={(v) => set('warehouseId', v)}>
                    <SelectTrigger><SelectValue placeholder="Pick a warehouse" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Loading pulls from here.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="v-calendar">Calendar names</Label>
                <Input
                  id="v-calendar"
                  value={form.calendarNames}
                  onChange={(e) => set('calendarNames', e.target.value)}
                  placeholder="e.g. #1 OG"
                />
                <p className="text-xs text-muted-foreground">
                  How job events name this truck, if not exactly as above. Separate several with
                  commas.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v-notes">Notes</Label>
              <textarea
                id="v-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Truck names on upcoming jobs that match no vehicle.
 *
 * Assigning one records it as a calendar name on that vehicle, which is what lets
 * a job be tied to a truck. Anything left here is a typo or a truck nobody added.
 */
function UnmatchedCalendarNames({
  names,
  vehicles,
  pending,
  onAssign,
}: {
  names: { name: string; jobs: number }[];
  vehicles: VehicleRow[];
  pending: boolean;
  onAssign: (vehicleId: string, name: string, vehicleName: string) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarSearch className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Calendar truck names we can&apos;t match
        </CardTitle>
        <CardDescription>
          Jobs from the last two weeks and next two months name these trucks, but no vehicle goes
          by that name. Pick the truck each one means — or fix the spelling on the calendar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {names.map((n) => (
            <li key={n.name} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">&ldquo;{n.name}&rdquo;</span>
              <span className="text-muted-foreground">
                {n.jobs} job{n.jobs === 1 ? '' : 's'}
              </span>
              <span className="flex-1" />
              <Select
                value={choice[n.name] ?? ''}
                onValueChange={(v) => setChoice((c) => ({ ...c, [n.name]: v }))}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Which truck is this?" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !choice[n.name]}
                onClick={() => {
                  const v = vehicles.find((x) => x.id === choice[n.name]);
                  if (v) onAssign(v.id, n.name, v.name);
                }}
              >
                Assign
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
