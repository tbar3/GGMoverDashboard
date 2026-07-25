import {
  getMonthlyPnL,
  getOperatingCosts,
  getJobProfitability,
  getWeeklyProfit,
} from '@/lib/profitability';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { OperatingCostsEditor } from './operating-costs-editor';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function money2(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const month = sp.month ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const [pnl, costs, jobs, weekly] = await Promise.all([
    getMonthlyPnL(year, month),
    getOperatingCosts(year, month),
    getJobProfitability(year, month),
    getWeeklyProfit(year, month),
  ]);

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const href = (p: { year: number; month: number }) => `/admin/profitability?year=${p.year}&month=${p.month}`;

  const net = pnl.netProfit;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profitability</h1>
          <p className="text-muted-foreground mt-1">
            Revenue &amp; materials from SmartMoving · labor from actual payroll · overhead entered below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(prev)}>
            <Button variant="outline" size="icon" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="font-semibold min-w-[9rem] text-center">{pnl.label}</span>
          <Link href={href(next)}>
            <Button variant="outline" size="icon" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Revenue" value={money(pnl.revenue)} sub={`${pnl.jobCount} jobs`} />
        <Kpi label="Gross profit" value={money(pnl.grossProfit)} sub={`${pnl.grossMargin.toFixed(0)}% margin`} />
        <Kpi label="Operating costs" value={money(pnl.operatingExpenses)} sub="overhead + debt + salaries" />
        <Kpi
          label="Net profit"
          value={money(net)}
          sub={`${pnl.netMargin.toFixed(0)}% margin`}
          highlight
          negative={net < 0}
        />
      </div>

      {/* Payroll completeness warning */}
      {pnl.payrollWeeks < 4 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Labor reflects <span className="font-medium">{pnl.payrollWeeks}</span> payroll week
            {pnl.payrollWeeks === 1 ? '' : 's'} imported for this month. Upload the remaining weekly
            Payroll Summaries for a complete labor figure.
          </span>
        </div>
      )}

      {/* P&L statement */}
      <Card>
        <CardHeader>
          <CardTitle>P&amp;L — {pnl.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xl space-y-1.5 text-sm">
            <PnlLine label="Revenue" value={pnl.revenue} bold />
            <PnlLine label="Less: Materials" value={-pnl.materialsCost} />
            <PnlLine label="Less: Labor (actual payroll)" value={-pnl.laborCost} />
            <PnlLine label="Gross profit" value={pnl.grossProfit} bold divider suffix={`${pnl.grossMargin.toFixed(0)}%`} />
            <PnlLine label="Less: Overhead" value={-pnl.overhead} />
            <PnlLine label="Less: Debt service" value={-pnl.debt} />
            <PnlLine label="Less: Owner / admin salaries" value={-pnl.salaries} />
            {pnl.otherCosts > 0 && <PnlLine label="Less: Other" value={-pnl.otherCosts} />}
            <PnlLine label="Net profit" value={pnl.netProfit} bold divider suffix={`${pnl.netMargin.toFixed(0)}%`} />
          </div>
        </CardContent>
      </Card>

      {/* Operating costs editor */}
      <OperatingCostsEditor year={year} month={month} costs={costs} />

      {/* Weekly breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly</CardTitle>
          <CardDescription>Gross = revenue − materials − payroll labor, by ISO week.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Materials</TableHead>
                <TableHead className="text-right">Labor</TableHead>
                <TableHead className="text-right">Gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekly.map((w) => (
                <TableRow key={w.weekStart}>
                  <TableCell>
                    {format(new Date(`${w.weekStart}T12:00:00`), 'MMM d')} –{' '}
                    {format(new Date(`${w.weekEnd}T12:00:00`), 'MMM d')}
                  </TableCell>
                  <TableCell className="text-right">{money2(w.revenue)}</TableCell>
                  <TableCell className="text-right">{money2(w.materials)}</TableCell>
                  <TableCell className="text-right">{money2(w.labor)}</TableCell>
                  <TableCell className={`text-right font-medium ${w.gross < 0 ? 'text-destructive' : ''}`}>
                    {money2(w.gross)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Job-by-job */}
      <Card>
        <CardHeader>
          <CardTitle>Job by job</CardTitle>
          <CardDescription>
            {jobs.length} jobs. Gross (ex-labor) = revenue − materials. Per-job wage cost isn&apos;t
            available yet (payroll is weekly), so SmartMoving&apos;s billed labor is shown for reference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Materials</TableHead>
                  <TableHead className="text-right">Labor (billed)</TableHead>
                  <TableHead className="text-right">Gross ex-labor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No jobs for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        {j.jobNumber ? `${j.jobNumber} · ` : ''}
                        {j.customer}
                      </TableCell>
                      <TableCell>{format(new Date(`${j.date}T12:00:00`), 'MMM d')}</TableCell>
                      <TableCell className="text-right">{money2(j.revenue)}</TableCell>
                      <TableCell className="text-right">{money2(j.materials)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{money2(j.laborBilled)}</TableCell>
                      <TableCell className="text-right font-medium">{money2(j.grossExLabor)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${negative ? 'text-destructive' : highlight ? 'text-primary' : ''}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PnlLine({
  label,
  value,
  bold,
  divider,
  suffix,
}: {
  label: string;
  value: number;
  bold?: boolean;
  divider?: boolean;
  suffix?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${divider ? 'border-t pt-1.5 mt-1.5' : ''} ${bold ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className={value < 0 ? 'text-muted-foreground' : ''}>
        {value < 0 ? `(${money2(Math.abs(value))})` : money2(value)}
        {suffix ? <span className="text-muted-foreground font-normal ml-2">{suffix}</span> : ''}
      </span>
    </div>
  );
}
