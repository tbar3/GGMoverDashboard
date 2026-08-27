import { addDays, format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPayrollRun, getPayrollRunWeeks, getWeekSummary } from '@/lib/payroll-run';
import { ReportUpload } from './report-upload';
import { CorrectionsTable } from './corrections-table';
import { PeriodSelect } from './period-select';
import { AdpTables } from './adp-tables';
import { WeekSummaryPanel } from './week-summary';
import { JobsReportUpload } from './jobs-report-upload';

function fmtDate(d: string, pattern = 'MMM d, yyyy'): string {
  return format(new Date(`${d}T12:00:00`), pattern);
}
// A pay period is the Mon–Sun week; the check date is the following-following Friday
// (period start + 11 days) — matches the existing payroll convention.
function periodInfo(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  return {
    end: format(addDays(start, 6), 'yyyy-MM-dd'),
    checkDate: format(addDays(start, 11), 'yyyy-MM-dd'),
  };
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
  const summary = weekStart ? await getWeekSummary(weekStart) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payroll Run</h1>
          <p className="text-muted-foreground mt-1">
            Import your SmartMoving payroll report, then key the two tables below into ADP RUN.
          </p>
        </div>
        <Link href={weekStart ? `/admin/payroll/audit?week=${weekStart}` : '/admin/payroll/audit'}>
          <Button variant="outline">
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Audit view
          </Button>
        </Link>
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Payroll period</span>
            <PeriodSelect
              weekStart={weekStart!}
              weeks={weeks.map((w) => ({
                weekStart: w.weekStart,
                label: `${fmtDate(w.weekStart, 'MMM d')} – ${fmtDate(periodInfo(w.weekStart).end, 'MMM d, yyyy')}`,
              }))}
            />
          </div>
          {weekStart && (
            <div className="text-sm">
              <span className="text-muted-foreground">Check date: </span>
              <span className="font-semibold">
                {fmtDate(periodInfo(weekStart).checkDate, 'EEE, MMM d, yyyy')}
              </span>
            </div>
          )}
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

          <AdpTables
            weekStart={run.weekStart}
            w2={run.w2}
            contractors1099={run.contractors1099}
          />

          <p className="text-xs text-muted-foreground">
            Bonus is the weekly performance bonus from the bonus engine. Tenure bonus (bi-annual)
            and marketing hours are layered in separately. Every value can be corrected before you
            key it into ADP.
          </p>

          {summary && (
            <Card>
              <CardHeader>
                <CardTitle>Week Summary</CardTitle>
                <CardDescription>
                  Overall numbers for the period, vs. the prior week. Import a SmartMoving jobs
                  report to fill jobs and revenue, or type them in; payroll gross comes from the
                  run and the labor-cost ratio is computed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <JobsReportUpload />
                <WeekSummaryPanel weekStart={run.weekStart} summary={summary} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
