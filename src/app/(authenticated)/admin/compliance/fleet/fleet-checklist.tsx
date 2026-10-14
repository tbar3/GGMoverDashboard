'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardCheck } from 'lucide-react';
import {
  CheckCell,
  ItemCell,
  ItemDialog,
  OdometerCell,
  OdometerDialog,
  PmCell,
  PmDialog,
  type ItemDialogTarget,
  type OdometerDialogTarget,
  type PmDialogTarget,
} from '@/components/compliance/checklist-cells';
import {
  VEHICLE_CHECKS,
  VEHICLE_ITEMS,
  VEHICLE_PM,
  type FleetChecklistRow,
} from '@/lib/compliance/checklists';

/**
 * One row per owned truck: what's onboard, then the dated obligations, then the
 * maintenance clocks. Everything is editable in place — the point is that the
 * whole fleet's paperwork is one screen, not twelve truck pages.
 */
export function FleetChecklist({
  rows,
  storageReady,
}: {
  rows: FleetChecklistRow[];
  storageReady: boolean;
}) {
  const [itemTarget, setItemTarget] = useState<ItemDialogTarget | null>(null);
  const [pmTarget, setPmTarget] = useState<PmDialogTarget | null>(null);
  const [odoTarget, setOdoTarget] = useState<OdometerDialogTarget | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Owned truck checklist
        </CardTitle>
        <CardDescription>
          What has to be onboard and current on every truck we own. Leased and rented units are
          left off; mark a truck Owned on its page to add it here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active owned trucks.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[110px]">Truck</TableHead>
                {VEHICLE_CHECKS.map((c) => (
                  <TableHead key={c.key} className="w-[90px] whitespace-normal text-xs leading-tight">
                    {c.short}
                  </TableHead>
                ))}
                {VEHICLE_ITEMS.map((s) => (
                  <TableHead key={s.key} className="min-w-[130px]">
                    {s.short}
                  </TableHead>
                ))}
                {VEHICLE_PM.map((p) => (
                  <TableHead key={p.key} className="min-w-[140px]">
                    {p.short}
                  </TableHead>
                ))}
                <TableHead className="min-w-[100px]">Mileage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.vehicle_id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/compliance/fleet/${row.vehicle_id}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  {VEHICLE_CHECKS.map((c) => (
                    <TableCell key={c.key}>
                      <CheckCell
                        entity="vehicle"
                        parentId={row.vehicle_id}
                        slotKey={c.key}
                        label={`${row.name}: ${c.label}`}
                        value={row.checks[c.key]}
                      />
                    </TableCell>
                  ))}
                  {VEHICLE_ITEMS.map((s) => (
                    <TableCell key={s.key}>
                      <ItemCell
                        value={row.items[s.key]}
                        onOpen={() =>
                          setItemTarget({
                            entity: 'vehicle',
                            parentId: row.vehicle_id,
                            parentName: row.name,
                            slot: s,
                            value: row.items[s.key],
                          })
                        }
                      />
                    </TableCell>
                  ))}
                  {VEHICLE_PM.map((p) => (
                    <TableCell key={p.key}>
                      <PmCell
                        value={row.pm[p.key]}
                        onOpen={() =>
                          setPmTarget({
                            vehicleId: row.vehicle_id,
                            vehicleName: row.name,
                            currentOdometer: row.current_odometer,
                            slot: p,
                            value: row.pm[p.key],
                          })
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <OdometerCell
                      odometer={row.current_odometer}
                      updatedOn={row.odometer_updated_on}
                      onOpen={() =>
                        setOdoTarget({
                          vehicleId: row.vehicle_id,
                          vehicleName: row.name,
                          current: row.current_odometer,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          PM and oil-change due dates calculate themselves from the last service. The mileage side
          counts from the truck&apos;s current mileage, so keep that updated (or log it with each
          service).
        </p>
      </CardContent>

      <ItemDialog target={itemTarget} storageReady={storageReady} onClose={() => setItemTarget(null)} />
      <PmDialog target={pmTarget} onClose={() => setPmTarget(null)} />
      <OdometerDialog target={odoTarget} onClose={() => setOdoTarget(null)} />
    </Card>
  );
}
