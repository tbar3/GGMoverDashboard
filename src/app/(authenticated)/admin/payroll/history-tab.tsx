import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { getAmendedWeeks, getClosedWeeks, getPayrollTrend } from '@/lib/payroll-history';
import { PayrollTrendChart } from './payroll-trend-chart';

/**
 * The running payroll record.
 *
 * Everything here comes from closed snapshots, so a week's figures cannot move
 * once it appears. Open weeks are deliberately absent — a week that can still
 * change is not history yet.
 */
export async function HistoryTab() {
  const [weeks, trend, amendments] = await Promise.all([
    getClosedWeeks(52),
    getPayrollTrend(26),
    getAmendedWeeks(),
  ]);

  if (weeks.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No closed weeks yet. Close a payroll week on the Run tab and it will start building here —
          gross payroll, bonus spend, and labor ratio, frozen week by week.
        </CardContent>
      </Card>
    );
  }

  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <PayrollTrendChart data={trend} />

      <Card>
        <CardHeader>
          <CardTitle>Closed weeks</CardTitle>
          <CardDescription>
            What was actually paid, week by week. Labor ratio is gross payroll over revenue as both
            stood when the week was closed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Reimbursed</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Labor %</TableHead>
                  <TableHead>Closed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      {formatDate(w.weekStart, 'MMM d, yyyy')}
                      {w.version > 1 && (
                        <Badge variant="secondary" className="ml-2">v{w.version}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{w.headcount}</TableCell>
                    <TableCell className="text-right">{w.totalHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{money(w.bonusTotal)}</TableCell>
                    <TableCell className="text-right">{money(w.reimbursementTotal)}</TableCell>
                    <TableCell className="text-right font-semibold">{money(w.grossPayroll)}</TableCell>
                    <TableCell className="text-right">
                      {w.revenue != null ? money(w.revenue) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.laborRatio != null ? `${w.laborRatio.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {w.closedByName}
                      <span className="block text-xs">{formatDate(w.closedAt, 'MMM d')}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {amendments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Amended weeks</CardTitle>
            <CardDescription>
              Weeks that were closed more than once. The earlier figure and the reason it was
              re-opened both stay on the record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead>Closed by</TableHead>
                    <TableHead>Re-opened</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amendments.map((a) => (
                    <TableRow key={`${a.weekStart}-${a.version}`} className={a.reopenedAt ? 'opacity-70' : undefined}>
                      <TableCell className="font-medium">
                        {formatDate(a.weekStart, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.reopenedAt ? 'secondary' : 'default'}>v{a.version}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{money(a.grossPayroll)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.closedByName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.reopenedAt ? formatDate(a.reopenedAt, 'MMM d, yyyy') : <span>current</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.reopenReason ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
