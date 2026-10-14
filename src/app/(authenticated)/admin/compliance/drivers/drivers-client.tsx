'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import {
  CheckCell,
  DocCell,
  ItemCell,
  ItemDialog,
  type ItemDialogTarget,
} from '@/components/compliance/checklist-cells';
import { DRIVER_CHECKS, DRIVER_ITEMS, type DriverChecklistRow } from '@/lib/compliance/checklists';

/**
 * Driver qualification files — one row per driver on the roster.
 *
 * Who counts as a driver is the employee's role (Driver), set on the Employees
 * page. The medical card is the only slot that expires; it shows up on the
 * Compliance overview and in the nav badge as it comes due, like any other item.
 */
export default function DriversClient({
  rows,
  storageReady,
}: {
  rows: DriverChecklistRow[];
  storageReady: boolean;
}) {
  const [target, setTarget] = useState<ItemDialogTarget | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Driver Files</h1>
        <p className="text-muted-foreground mt-1">
          Application, DOT medical card, driver test and insurance approval for every driver.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drivers</CardTitle>
          <CardDescription>
            Everyone with the Driver role. Change someone&apos;s role on the Employees page to add or
            remove them. Files here are visible to the back office only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active employees have the Driver role.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Driver</TableHead>
                  <TableHead className="min-w-[100px]">Hire date</TableHead>
                  {DRIVER_ITEMS.map((s) => (
                    <TableHead key={s.key} className="min-w-[120px]">
                      {s.short}
                    </TableHead>
                  ))}
                  {DRIVER_CHECKS.map((c) => (
                    <TableHead key={c.key} className="w-[100px] whitespace-normal leading-tight">
                      {c.short}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employee_id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/employees/${row.employee_id}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.hire_date ? formatDate(row.hire_date, 'MMM d, yyyy') : '—'}
                    </TableCell>
                    {DRIVER_ITEMS.map((s) => {
                      const value = row.items[s.key];
                      const open = () =>
                        setTarget({
                          entity: 'employee',
                          parentId: row.employee_id,
                          parentName: row.name,
                          slot: s,
                          value,
                        });
                      return (
                        <TableCell key={s.key}>
                          {s.cadenceMonths != null ? (
                            <ItemCell value={value} onOpen={open} />
                          ) : (
                            <DocCell value={value} onOpen={open} />
                          )}
                        </TableCell>
                      );
                    })}
                    {DRIVER_CHECKS.map((c) => (
                      <TableCell key={c.key}>
                        <CheckCell
                          entity="employee"
                          parentId={row.employee_id}
                          slotKey={c.key}
                          label={`${row.name}: ${c.label}`}
                          value={row.checks[c.key]}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Hire date comes from the employee record; edit it there. The application and driver
            test are the DOT sample forms, signed and scanned.
          </p>
        </CardContent>
      </Card>

      <ItemDialog target={target} storageReady={storageReady} onClose={() => setTarget(null)} />
    </div>
  );
}
