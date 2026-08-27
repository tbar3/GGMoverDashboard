'use client';

import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronRight, AlertTriangle, PencilLine } from 'lucide-react';
import type { EmployeeAudit, AuditInput } from '@/lib/payroll-audit';

/**
 * The per-employee derivation. Collapsed it reads like the ADP tables; expanded it
 * shows every input, where that input came from, and the arithmetic that turned it
 * into the ADP row. Read-only by design — this view explains the run, it never
 * edits it (corrections stay on the Payroll Run page).
 */

function fmt(v: number, kind: AuditInput['kind']): string {
  return kind === 'hours' ? v.toFixed(2) : `$${v.toFixed(2)}`;
}

function InputRow({ input }: { input: AuditInput }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[11rem_7rem_1fr] gap-x-4 gap-y-0.5 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm font-medium">{input.label}</span>
      <span className="text-sm tabular-nums sm:text-right">
        {fmt(input.value, input.kind)}
        {input.overridden && (
          <PencilLine className="inline h-3 w-3 ml-1 text-amber-600 dark:text-amber-500" />
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {input.source}
        {input.derivation && <span className="block">{input.derivation}</span>}
        {input.overridden && input.systemValue != null && (
          <span className="block text-amber-700 dark:text-amber-500">
            System computed {fmt(input.systemValue, input.kind)} — overridden by hand
          </span>
        )}
      </span>
    </div>
  );
}

export function EmployeeAuditTable({ employees }: { employees: EmployeeAudit[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Employee</TableHead>
          <TableHead>Table</TableHead>
          <TableHead className="text-right">Total Hrs</TableHead>
          <TableHead className="text-right">Reg</TableHead>
          <TableHead className="text-right">OT</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="text-right">Total Comp</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((e) => {
          const isOpen = open.has(e.employeeId);
          return (
            <Fragment key={e.employeeId}>
              <TableRow
                className="cursor-pointer"
                onClick={() => toggle(e.employeeId)}
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>
                  {e.adp.table ? (
                    <Badge variant="secondary">{e.adp.table}</Badge>
                  ) : (
                    <Badge variant="destructive">Unclassified</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.totalHours.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.regularHours.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.overtimeHours.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">${e.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ${e.totalCompensation.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {e.overriddenFields.length > 0 && (
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-500">
                        <PencilLine className="h-3 w-3" /> {e.overriddenFields.length} corrected
                      </Badge>
                    )}
                    {e.flags.length > 0 && (
                      <Badge variant="outline" className="text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {e.flags.length}
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>

              {isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="bg-muted/40 p-0">
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Inputs and where they came from
                        </p>
                        {e.inputs.map((i) => (
                          <InputRow key={i.label} input={i} />
                        ))}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            Hours
                          </p>
                          <p className="text-sm">{e.hoursMath}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            Compensation
                          </p>
                          <p className="text-sm">{e.payMath}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          What gets keyed into {e.adp.table ?? 'ADP'}
                        </p>
                        {e.adp.table ? (
                          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
                            {e.adp.columns.map((c) => (
                              <span key={c.label} className="text-sm">
                                <span className="text-muted-foreground">{c.label}:</span>{' '}
                                <span className="font-medium tabular-nums">{fmt(c.value, c.kind)}</span>{' '}
                                <span className="text-xs text-muted-foreground">({c.from})</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p
                          className={`text-sm ${
                            e.adp.ok ? 'text-muted-foreground' : 'text-destructive font-medium'
                          }`}
                        >
                          {e.adp.ok ? '✓ ' : '✗ '}
                          {e.adp.check}
                        </p>
                      </div>

                      {e.flags.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-1">
                            Exceptions
                          </p>
                          <ul className="list-disc pl-5 text-sm text-destructive space-y-0.5">
                            {e.flags.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
