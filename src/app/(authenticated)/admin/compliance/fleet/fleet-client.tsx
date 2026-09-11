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
import { Plus, Pencil, Link2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import { saveVehicle, addVehicleFromTruck, type VehicleInput } from '@/lib/compliance/vehicle-actions';
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
  };
}

export default function FleetClient({
  vehicles,
  unlinkedTrucks,
  pmSchedules,
}: {
  vehicles: VehicleRow[];
  unlinkedTrucks: { id: number; name: string }[];
  pmSchedules: PmScheduleRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
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
    });
    setDialogOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: VehicleInput = {
      id: editing?.id,
      name: form.name,
      truckId: editing?.truck_id ?? null,
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
          <h1 className="text-2xl font-bold text-foreground">Fleet &amp; Maintenance</h1>
          <p className="text-muted-foreground mt-1">
            Every vehicle, what it owes, and what it&apos;s due for.
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
              These exist in Materials but have no compliance record, so nothing tracks their
              registration or maintenance. The two lists are kept separately on purpose — this is
              where the difference shows up.
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

      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
          <CardDescription>
            Status is the worst of the vehicle&apos;s compliance items and maintenance schedules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate / VIN</TableHead>
                  <TableHead>Odometer</TableHead>
                  <TableHead>PM due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No vehicles yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  vehicles.map((vehicle) => {
                    const due = (pmByVehicle.get(vehicle.id) ?? []).filter(
                      (s) => s.state === 'expired' || s.state === 'due_soon'
                    );
                    return (
                      <TableRow key={vehicle.id} className={vehicle.active ? '' : 'opacity-60'}>
                        <TableCell>
                          <Link
                            href={`/admin/compliance/fleet/${vehicle.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {vehicle.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                              'Details not filled in'}
                            {!vehicle.active && ' · Inactive'}
                          </p>
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
                        <TableCell className="text-right">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add vehicle'}</DialogTitle>
            <DialogDescription>
              Trailers and rented units belong here too — they carry registrations of their own.
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
                  Match the Materials truck name where there is one.
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
                <Select value={form.ownership} onValueChange={(v) => set('ownership', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OWNERSHIP_TYPES.map((o) => (
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
                  onCheckedChange={(v) => set('active', v === true)}
                />
                Active
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Marking it a CMV is what says the DOT annual inspection and driver qualification rules
              apply — usually anything over 10,000 lbs GVWR.
            </p>

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
