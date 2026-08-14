import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { getPayrollRun, getPayrollRunWeeks } from '@/lib/payroll-run';
import { ReportUpload } from './report-upload';
import { CorrectionsTable } from './corrections-table';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
function hrs(n: number): string {
  return n.toFixed(2);
}

export default async function PayrollRunPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weeks = await getPayrollRunWeeks();
  const weekStart = week ?? weeks[0]?.weekStart ?? null;
  const run = weekStart ? await getPayrollRun(weekStart) : null;

  const w2Tot = run?.w2.reduce(
    (a, r) => ({ reg: a.reg + r.regularHours, ot: a.ot + r.overtimeHours, bonus: a.bonus + r.bonus }),
    { reg: 0, ot: 0, bonus: 0 }
  );
  const c99Tot = run?.contractors1099.reduce(
    (a, r) => ({ hours: a.hours + r.compHours, amt: a.amt + r.compAmount }),
    { hours: 0, amt: 0 }
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payroll Run</h1>
        <p className="text-muted-foreground mt-1">
          Import your SmartMoving payroll report, then key the two tables below into ADP RUN.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import a week
          </CardTitle>
          <CardDescription>
            Upload the SmartMoving payroll detail report (.csv or .xlsx). We compute hours, warehouse
            time, overtime, and earnings automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportUpload />
        </CardContent>
      </Card>

      {weeks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Week:</span>
          {weeks.map((w) => (
            <Link
              key={w.weekStart}
              href={`/admin/payroll/run?week=${w.weekStart}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                w.weekStart === weekStart ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {w.periodStart ?? w.weekStart}
            </Link>
          ))}
        </div>
      )}

      {!run ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No payroll imported yet. Upload a SmartMoving report to get started.
          </CardContent>
        </Card>
      ) : (
        <>
          {run.audit.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                  Check before running ({run.audit.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm space-y-1 text-amber-700 dark:text-amber-500">
                  {run.audit.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Review & correct — everything overridable before export */}
          <Card>
            <CardHeader>
              <CardTitle>Review &amp; Correct</CardTitle>
              <CardDescription>
                Edit any value (warehouse, marketing, tips, commissions, bonus, mileage) before
                keying into ADP. Corrections stick through re-imports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CorrectionsTable weekStart={run.weekStart} detail={run.detail} />
            </CardContent>
          </Card>

          {/* ADP 1099 contractors */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>ADP — 1099 Contractors</CardTitle>
                  <CardDescription>
                    {run.contractors1099.length} contractors · Comp Hours = total hours + ½ OT
                  </CardDescription>
                </div>
                <a href={`/api/payroll/export?type=1099&week=${run.weekStart}`}>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </a>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contractor</TableHead>
                    <TableHead className="text-right">Comp Hours</TableHead>
                    <TableHead className="text-right">Comp Amount</TableHead>
                    <TableHead className="text-right">Reimbursement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.contractors1099.map((r) => (
                    <TableRow key={r.contractor}>
                      <TableCell className="font-medium">{r.contractor}</TableCell>
                      <TableCell className="text-right">{hrs(r.compHours)}</TableCell>
                      <TableCell className="text-right">{money(r.compAmount)}</TableCell>
                      <TableCell className="text-right">{money(r.reimbursement)}</TableCell>
                    </TableRow>
                  ))}
                  {c99Tot && run.contractors1099.length > 0 && (
                    <TableRow className="font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{hrs(c99Tot.hours)}</TableCell>
                      <TableCell className="text-right">{money(c99Tot.amt)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                  {run.contractors1099.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No 1099 contractors this week.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ADP W-2 employees */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>ADP — W-2 Employees</CardTitle>
                  <CardDescription>
                    {run.w2.length} employees · Regular (≤40) + Overtime (&gt;40) hours
                  </CardDescription>
                </div>
                <a href={`/api/payroll/export?type=w2&week=${run.weekStart}`}>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </a>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Reg Hrs</TableHead>
                    <TableHead className="text-right">OT Hrs</TableHead>
                    <TableHead className="text-right">Tips</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Commissions</TableHead>
                    <TableHead className="text-right">Reimb.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.w2.map((r) => (
                    <TableRow key={r.employee}>
                      <TableCell className="font-medium">{r.employee}</TableCell>
                      <TableCell className="text-right">{hrs(r.regularHours)}</TableCell>
                      <TableCell className="text-right">{hrs(r.overtimeHours)}</TableCell>
                      <TableCell className="text-right">{money(r.tips)}</TableCell>
                      <TableCell className="text-right">{money(r.bonus)}</TableCell>
                      <TableCell className="text-right">{money(r.commissions)}</TableCell>
                      <TableCell className="text-right">{money(r.reimbursement)}</TableCell>
                    </TableRow>
                  ))}
                  {w2Tot && run.w2.length > 0 && (
                    <TableRow className="font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{hrs(w2Tot.reg)}</TableCell>
                      <TableCell className="text-right">{hrs(w2Tot.ot)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{money(w2Tot.bonus)}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  )}
                  {run.w2.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        No W-2 employees this week.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Bonus is the weekly performance bonus from the bonus engine. Tenure bonus (bi-annual)
            and marketing hours are layered in separately. Every value can be corrected before you
            key it into ADP.
          </p>
        </>
      )}
    </div>
  );
}
