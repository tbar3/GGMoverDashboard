'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ArrowLeft, Gauge, Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { StateBadge } from '@/components/compliance/state-badge';
import { AttachmentPanel } from '@/components/compliance/attachment-panel';
import { todayLocalIso } from '@/lib/compliance/status';
import {
  recordOdometer,
  savePmSchedule,
  deletePmSchedule,
  logService,
  deleteServiceEntry,
} from '@/lib/compliance/vehicle-actions';
import {
  PM_SERVICE_TYPES,
  categoryLabel,
  serviceTypeLabel,
  type ComplianceAttachment,
  type ComplianceItemRow,
  type OdometerReading,
  type PmScheduleRow,
  type ServiceLogEntry,
  type Vehicle,
} from '@/lib/compliance/types';
import type { EmployeeOption } from '@/lib/compliance/queries';

const NONE = '__none__';

type Result = { ok: boolean; error?: string };

export default function VehicleDetail({
  vehicle,
  items,
  schedules,
  log,
  readings,
  attachments,
  employees,
  storageReady,
}: {
  vehicle: Vehicle;
  items: ComplianceItemRow[];
  schedules: PmScheduleRow[];
  log: ServiceLogEntry[];
  readings: OdometerReading[];
  attachments: ComplianceAttachment[];
  employees: EmployeeOption[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [odoOpen, setOdoOpen] = useState(false);
  const [odo, setOdo] = useState({ readingDate: todayLocalIso(), odometer: '', note: '' });

  const [pmOpen, setPmOpen] = useState(false);
  const [editingPm, setEditingPm] = useState<PmScheduleRow | null>(null);
  const [pmForm, setPmForm] = useState(emptyPm);

  const [serviceOpen, setServiceOpen] = useState(false);
  const [service, setService] = useState(emptyService);

  function run(fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      onSuccess?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  function emptyPm() {
    return {
      serviceType: 'oil_change',
      customLabel: '',
      intervalMiles: '5000',
      intervalDays: '',
      lastServiceDate: '',
      lastServiceOdometer: '',
      leadTimeDays: '14',
      leadMiles: '500',
      active: true,
      notes: '',
    };
  }

  function emptyService() {
    return {
      pmScheduleId: '',
      serviceType: 'other',
      description: '',
      serviceDate: todayLocalIso(),
      odometer: '',
      vendor: '',
      invoiceNumber: '',
      cost: '',
      performedBy: '',
      notes: '',
    };
  }

  function openNewPm() {
    setEditingPm(null);
    setPmForm(emptyPm());
    setPmOpen(true);
  }

  function openEditPm(schedule: PmScheduleRow) {
    setEditingPm(schedule);
    setPmForm({
      serviceType: schedule.service_type,
      customLabel: schedule.custom_label ?? '',
      intervalMiles: schedule.interval_miles != null ? String(schedule.interval_miles) : '',
      intervalDays: schedule.interval_days != null ? String(schedule.interval_days) : '',
      lastServiceDate: schedule.last_service_date?.slice(0, 10) ?? '',
      lastServiceOdometer:
        schedule.last_service_odometer != null ? String(schedule.last_service_odometer) : '',
      leadTimeDays: String(schedule.lead_time_days),
      leadMiles: String(schedule.lead_miles),
      active: schedule.active,
      notes: schedule.notes ?? '',
    });
    setPmOpen(true);
  }

  /** Logging against a schedule prefills its service type — they must agree. */
  function openLogService(schedule?: PmScheduleRow) {
    const base = emptyService();
    setService({
      ...base,
      pmScheduleId: schedule?.id ?? '',
      serviceType: schedule?.service_type ?? 'other',
      description: schedule ? serviceTypeLabel(schedule.service_type, schedule.custom_label) : '',
      odometer: vehicle.current_odometer != null ? String(vehicle.current_odometer) : '',
    });
    setServiceOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/admin/compliance/fleet">
            <ArrowLeft className="h-4 w-4" />
            Fleet
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{vehicle.name}</h1>
              {!vehicle.active && <Badge variant="secondary">Inactive</Badge>}
              {vehicle.is_cmv && <Badge variant="outline">CMV</Badge>}
            </div>
            <p className="text-muted-foreground mt-1">
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                'Details not filled in yet'}
              {vehicle.license_plate && ` · ${vehicle.license_plate} (${vehicle.plate_state})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOdoOpen(true)}>
              <Gauge className="h-4 w-4" />
              {vehicle.current_odometer != null
                ? `${vehicle.current_odometer.toLocaleString()} mi`
                : 'Add odometer'}
            </Button>
            <Button onClick={() => openLogService()}>
              <Wrench className="h-4 w-4" />
              Log service
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="maintenance">
        <TabsList>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="items">Compliance ({items.length})</TabsTrigger>
          <TabsTrigger value="history">Service history ({log.length})</TabsTrigger>
          <TabsTrigger value="odometer">Odometer</TabsTrigger>
          <TabsTrigger value="files">Files ({attachments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>PM schedules</CardTitle>
                <CardDescription>
                  Due by mileage or by time — whichever comes first.
                </CardDescription>
              </div>
              <Button size="sm" onClick={openNewPm}>
                <Plus className="h-4 w-4" />
                Add schedule
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Every</TableHead>
                      <TableHead>Last done</TableHead>
                      <TableHead>Next due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No maintenance schedules yet. Add one and log the last service to set its
                          baseline.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schedules.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {serviceTypeLabel(s.service_type, s.custom_label)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[
                              s.interval_miles ? `${s.interval_miles.toLocaleString()} mi` : null,
                              s.interval_days ? `${s.interval_days} days` : null,
                            ]
                              .filter(Boolean)
                              .join(' or ')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.last_service_date
                              ? formatDate(s.last_service_date, 'MMM d, yyyy')
                              : '—'}
                            {s.last_service_odometer != null && (
                              <p className="text-xs text-muted-foreground">
                                {s.last_service_odometer.toLocaleString()} mi
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.next_due_date ? formatDate(s.next_due_date, 'MMM d, yyyy') : '—'}
                            {s.next_due_odometer != null && (
                              <p className="text-xs text-muted-foreground">
                                {s.next_due_odometer.toLocaleString()} mi
                                {s.miles_remaining != null &&
                                  ` · ${s.miles_remaining.toLocaleString()} to go`}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <StateBadge state={s.state} />
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openLogService(s)}
                              disabled={pending}
                            >
                              {s.state === 'unknown' ? 'Log first service' : 'Log'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit schedule"
                              onClick={() => openEditPm(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete schedule"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    'Delete this schedule? Past service entries are kept.'
                                  )
                                )
                                  return;
                                run(
                                  () => deletePmSchedule(s.id, vehicle.id),
                                  'Schedule deleted'
                                );
                              }}
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
        </TabsContent>

        <TabsContent value="items" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance items</CardTitle>
              <CardDescription>
                Registration, inspection, and anything else filed against this vehicle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nothing filed against this vehicle yet. Add an item from the Compliance
                          Items page and set &quot;Applies to&quot; to this vehicle.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Link
                              href={`/admin/compliance/items/${item.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {item.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {categoryLabel(item.category)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.expiration_date
                              ? formatDate(item.expiration_date, 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <StateBadge state={item.state} daysUntil={item.days_until} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Service history</CardTitle>
              <CardDescription>
                Everything done to this truck, scheduled or not.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Odometer</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No service logged yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      log.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">
                            {formatDate(entry.service_date, 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {entry.description || serviceTypeLabel(entry.service_type)}
                            </span>
                            {entry.notes && (
                              <p className="text-xs text-muted-foreground">{entry.notes}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.odometer != null ? `${entry.odometer.toLocaleString()} mi` : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.vendor ?? entry.performed_by_name ?? '—'}
                            {entry.invoice_number && (
                              <p className="font-mono text-xs">{entry.invoice_number}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.cost != null ? `$${Number(entry.cost).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete service entry"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm('Delete this service entry?')) return;
                                run(
                                  () => deleteServiceEntry(entry.id, vehicle.id),
                                  'Entry deleted'
                                );
                              }}
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
        </TabsContent>

        <TabsContent value="odometer" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Odometer readings</CardTitle>
              <CardDescription>
                Mileage-based maintenance counts from the newest reading. Entered by hand today —
                a Motive feed can fill this in automatically later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reading</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Recorded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No readings yet. Mileage-based schedules stay on &quot;needs
                          baseline&quot; until there is one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      readings.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">
                            {formatDate(r.reading_date, 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.odometer.toLocaleString()} mi
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.source.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.recorded_by_name ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <AttachmentPanel
                parentKind="vehicle"
                parentId={vehicle.id}
                attachments={attachments}
                storageReady={storageReady}
                title="Vehicle files"
                description="Title, lease agreement, inspection reports — anything that belongs to the truck itself."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Odometer */}
      <Dialog open={odoOpen} onOpenChange={setOdoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record odometer</DialogTitle>
            <DialogDescription>
              Re-entering a date you already logged corrects it rather than adding a duplicate.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  recordOdometer({
                    vehicleId: vehicle.id,
                    readingDate: odo.readingDate,
                    odometer: Number(odo.odometer),
                    note: odo.note,
                  }),
                'Odometer recorded',
                () => setOdo({ readingDate: todayLocalIso(), odometer: '', note: '' })
              );
              setOdoOpen(false);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="o-date">Date</Label>
                <Input
                  id="o-date"
                  type="date"
                  value={odo.readingDate}
                  onChange={(e) => setOdo({ ...odo, readingDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-miles">Miles</Label>
                <Input
                  id="o-miles"
                  type="number"
                  min={0}
                  value={odo.odometer}
                  onChange={(e) => setOdo({ ...odo, odometer: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="o-note">Note</Label>
              <Input
                id="o-note"
                value={odo.note}
                onChange={(e) => setOdo({ ...odo, note: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOdoOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>Save reading</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PM schedule */}
      <Dialog open={pmOpen} onOpenChange={setPmOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPm ? 'Edit schedule' : 'Add PM schedule'}</DialogTitle>
            <DialogDescription>
              Set a mileage interval, a time interval, or both. With both, it comes due on whichever
              hits first.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  savePmSchedule({
                    id: editingPm?.id,
                    vehicleId: vehicle.id,
                    serviceType: pmForm.serviceType,
                    customLabel: pmForm.customLabel,
                    intervalMiles: pmForm.intervalMiles ? Number(pmForm.intervalMiles) : null,
                    intervalDays: pmForm.intervalDays ? Number(pmForm.intervalDays) : null,
                    lastServiceDate: pmForm.lastServiceDate || null,
                    lastServiceOdometer: pmForm.lastServiceOdometer
                      ? Number(pmForm.lastServiceOdometer)
                      : null,
                    leadTimeDays: Number(pmForm.leadTimeDays || 0),
                    leadMiles: Number(pmForm.leadMiles || 0),
                    active: pmForm.active,
                    notes: pmForm.notes,
                  }),
                editingPm ? 'Schedule updated' : 'Schedule added',
                () => setPmOpen(false)
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Service</Label>
              <Select
                value={pmForm.serviceType}
                onValueChange={(v) => setPmForm({ ...pmForm, serviceType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PM_SERVICE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pmForm.serviceType === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="pm-label">Name it</Label>
                <Input
                  id="pm-label"
                  value={pmForm.customLabel}
                  onChange={(e) => setPmForm({ ...pmForm, customLabel: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pm-miles">Every … miles</Label>
                <Input
                  id="pm-miles"
                  type="number"
                  min={1}
                  value={pmForm.intervalMiles}
                  onChange={(e) => setPmForm({ ...pmForm, intervalMiles: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pm-days">Every … days</Label>
                <Input
                  id="pm-days"
                  type="number"
                  min={1}
                  value={pmForm.intervalDays}
                  onChange={(e) => setPmForm({ ...pmForm, intervalDays: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pm-lastdate">Last done on</Label>
                <Input
                  id="pm-lastdate"
                  type="date"
                  value={pmForm.lastServiceDate}
                  onChange={(e) => setPmForm({ ...pmForm, lastServiceDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pm-lastodo">Last done at (miles)</Label>
                <Input
                  id="pm-lastodo"
                  type="number"
                  min={0}
                  value={pmForm.lastServiceOdometer}
                  onChange={(e) => setPmForm({ ...pmForm, lastServiceOdometer: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Until one of these is set the schedule shows as &quot;needs baseline&quot; — there is
              nothing to count from.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pm-leaddays">Warn … days ahead</Label>
                <Input
                  id="pm-leaddays"
                  type="number"
                  min={0}
                  value={pmForm.leadTimeDays}
                  onChange={(e) => setPmForm({ ...pmForm, leadTimeDays: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pm-leadmiles">Warn … miles ahead</Label>
                <Input
                  id="pm-leadmiles"
                  type="number"
                  min={0}
                  value={pmForm.leadMiles}
                  onChange={(e) => setPmForm({ ...pmForm, leadMiles: e.target.value })}
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={pmForm.active}
                onCheckedChange={(v) => setPmForm({ ...pmForm, active: v === true })}
              />
              Active
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPmOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Service log */}
      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log service</DialogTitle>
            <DialogDescription>
              Logging against a schedule resets its clock and records the mileage.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  logService({
                    vehicleId: vehicle.id,
                    pmScheduleId: service.pmScheduleId || null,
                    serviceType: service.serviceType,
                    description: service.description,
                    serviceDate: service.serviceDate,
                    odometer: service.odometer ? Number(service.odometer) : null,
                    vendor: service.vendor,
                    invoiceNumber: service.invoiceNumber,
                    cost: service.cost ? Number(service.cost) : null,
                    performedBy: service.performedBy || null,
                    notes: service.notes,
                  }),
                'Service logged',
                () => setServiceOpen(false)
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Against schedule</Label>
              <Select
                value={service.pmScheduleId || NONE}
                onValueChange={(v) => {
                  const picked = schedules.find((s) => s.id === v);
                  setService({
                    ...service,
                    pmScheduleId: v === NONE ? '' : v,
                    serviceType: picked?.service_type ?? service.serviceType,
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="One-off repair" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>One-off repair (no schedule)</SelectItem>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {serviceTypeLabel(s.service_type, s.custom_label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-desc">What was done</Label>
              <Input
                id="s-desc"
                value={service.description}
                onChange={(e) => setService({ ...service, description: e.target.value })}
                placeholder="Oil & filter, front brakes…"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-date">Date</Label>
                <Input
                  id="s-date"
                  type="date"
                  value={service.serviceDate}
                  onChange={(e) => setService({ ...service, serviceDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-odo">Odometer</Label>
                <Input
                  id="s-odo"
                  type="number"
                  min={0}
                  value={service.odometer}
                  onChange={(e) => setService({ ...service, odometer: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-vendor">Vendor</Label>
                <Input
                  id="s-vendor"
                  value={service.vendor}
                  onChange={(e) => setService({ ...service, vendor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-invoice">Invoice #</Label>
                <Input
                  id="s-invoice"
                  value={service.invoiceNumber}
                  onChange={(e) => setService({ ...service, invoiceNumber: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-cost">Cost</Label>
                <Input
                  id="s-cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={service.cost}
                  onChange={(e) => setService({ ...service, cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Done in-house by</Label>
                <Select
                  value={service.performedBy || NONE}
                  onValueChange={(v) =>
                    setService({ ...service, performedBy: v === NONE ? '' : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Outside vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Outside vendor</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-notes">Notes</Label>
              <textarea
                id="s-notes"
                rows={2}
                value={service.notes}
                onChange={(e) => setService({ ...service, notes: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setServiceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Log service'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
