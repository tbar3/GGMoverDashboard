import Link from 'next/link';
import { addDays, format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, XCircle } from 'lucide-react';
import { getPayrollRunWeeks } from '@/lib/payroll-run';
import { getPayrollAudit } from '@/lib/payroll-audit';
import { PeriodSelect } from '../run/period-select';
import { EmployeeAuditTable } from './employee-audit-table';

/**
 * Payroll Audit — a read-only lens over a Payroll Run week for finance review.
 * It recomputes nothing and changes nothing: it explains where every figure came
 * from, cross-foots the run against the ADP tables, and surfaces the manual-change
 * trail. Corrections still happen on the Payroll Run page.
 */

function fmtDate(d: string, pattern = 'MMM d, yyyy'): string {
  return format(new Date(`${d}T12:00:00`), pattern);
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default async function PayrollAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weeks = await getPayrollRunWeeks();
  const weekStart = week ?? weeks[0]?.weekStart ?? null;
  const audit = weekStart ? await getPayrollAudit(weekStart) : null;

  const failing = audit?.checks.filter((c) => !c.ok) ?? [];
  const exceptions = audit?.employees.filter((e) => e.flags.length > 0) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payroll Audit</h1>
          <p className="text-muted-foreground mt-1">
            Where every number came from, how it was calculated, and what a human changed.
            Read-only — corrections are made on the Payroll Run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {weekStart && (
            <a href={`/api/payroll/audit/export?week=${weekStart}`}>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1.5" /> Audit pack (CSV)
              </Button>
            </a>
          )}
          <Link href={weekStart ? `/admin/payroll/run?week=${weekStart}` : '/admin/payroll/run'}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Payroll Run
            </Button>
          </Link>
        </div>
      </div>

      {weeks.length > 0 && weekStart && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Payroll period</span>
            <PeriodSelect
              basePath="/admin/payroll/audit"
              weekStart={weekStart}
              weeks={weeks.map((w) => ({
                weekStart: w.weekStart,
                label: `${fmtDate(w.weekStart, 'MMM d')} – ${format(
                  addDays(new Date(`${w.weekStart}T12:00:00`), 6),
                  'MMM d, yyyy'
                )}`,
              }))}
            />
          </div>
        </div>
      )}

      {!audit ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No payroll imported yet — nothing to audit.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Provenance — what was imported, from which file, when */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Source of record
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-muted-foreground">Pay period</p>
                <p className="font-medium">{audit.weekLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Check date</p>
                <p className="font-medium">{fmtDate(audit.checkDate, 'EEE, MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Imported file</p>
                <p className="font-medium break-all">{audit.provenance.sourceFile ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Imported at</p>
                <p className="font-medium">
                  {audit.provenance.importedAt
                    ? format(new Date(audit.provenance.importedAt), 'MMM d, yyyy h:mm a')
                    : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Reconciliation — the cross-foots an F&A reviewer would redo by hand */}
          <Card className={failing.length > 0 ? 'border-destructive/50' : 'border-emerald-600/40'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {failing.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                Reconciliation
                <Badge variant={failing.length === 0 ? 'secondary' : 'destructive'}>
                  {audit.checks.length - failing.length}/{audit.checks.length} tie
                </Badge>
              </CardTitle>
              <CardDescription>
                Independent cross-foots of the run against the two ADP tables. Nothing here
                changes a figure — a failing check is reported, never corrected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {audit.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${c.ok ? '' : 'text-destructive'}`}>
                      {c.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums shrink-0">
                    <span className={c.ok ? 'text-muted-foreground' : 'text-destructive font-medium'}>
                      {c.actual}
                    </span>
                    {String(c.expected) !== String(c.actual) && (
                      <span className="text-xs text-muted-foreground block">vs {c.expected}</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Week totals */}
          <Card>
            <CardHeader>
              <CardTitle>Week totals</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
              {[
                ['Billable hours', audit.totals.billableHours.toFixed(2)],
                ['Warehouse hours', audit.totals.warehouseHours.toFixed(2)],
                ['Marketing hours', audit.totals.marketingHours.toFixed(2)],
                ['Total hours', audit.totals.totalHours.toFixed(2)],
                ['Regular hours', audit.totals.regularHours.toFixed(2)],
                ['Overtime hours', audit.totals.overtimeHours.toFixed(2)],
                ['Tips', money(audit.totals.tips)],
                ['Commissions', money(audit.totals.commissions)],
                ['Bonus', money(audit.totals.bonus)],
                ['Mileage', money(audit.totals.mileage)],
                ['W-2 / 1099', `${audit.totals.w2Count} / ${audit.totals.count1099}`],
                ['Total compensation', money(audit.totals.totalCompensation)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Exceptions */}
          {(exceptions.length > 0 || audit.runFlags.length > 0) && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                  Exceptions ({exceptions.reduce((n, e) => n + e.flags.length, 0)})
                </CardTitle>
                <CardDescription>
                  Conditions worth a reviewer&apos;s eye before the run is keyed into ADP.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm space-y-1 text-amber-700 dark:text-amber-500">
                  {exceptions.flatMap((e) =>
                    e.flags.map((f, i) => (
                      <li key={`${e.employeeId}-${i}`}>
                        <span className="font-medium">{e.name}:</span> {f}
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Per-employee derivation */}
          <Card>
            <CardHeader>
              <CardTitle>Per-employee derivation</CardTitle>
              <CardDescription>
                Click any row to see every input, its source, the arithmetic, and the ADP row it
                produces.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmployeeAuditTable employees={audit.employees} />
            </CardContent>
          </Card>

          {/* Manual change trail */}
          <Card>
            <CardHeader>
              <CardTitle>Manual change log</CardTitle>
              <CardDescription>
                Every hand-entered correction to this week — who, when, and from what. Recorded
                from the day this log was added; earlier corrections predate it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.changeLog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No manual changes recorded for this week.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead className="text-right">From</TableHead>
                      <TableHead className="text-right">To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.changeLog.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(c.changedAt), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell>{c.changedByName ?? '—'}</TableCell>
                        <TableCell>{c.employeeName ?? <span className="text-muted-foreground">week-level</span>}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground text-xs">{c.scope}</span> {c.field}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c.oldValue ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {c.newValue ?? 'cleared'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
