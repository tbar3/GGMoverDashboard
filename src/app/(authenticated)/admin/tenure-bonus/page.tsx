import Link from 'next/link';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTenureBonus, upcomingTenurePeriodKey } from '@/lib/tenure-bonus';
import { PoolInput } from './pool-input';

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A few payout periods to switch between.
function periodOptions(now: Date): string[] {
  const y = now.getFullYear();
  return [`${y}-06`, `${y}-12`, `${y + 1}-06`, `${y + 1}-12`];
}

export default async function TenureBonusPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const now = new Date();
  const periodKey = period && /^\d{4}-(06|12)$/.test(period) ? period : upcomingTenurePeriodKey(now);
  const t = await getTenureBonus(periodKey);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tenure Bonus</h1>
        <p className="text-muted-foreground mt-1">
          Bi-annual pool (1% of revenue − damages) split by months of tenure. Paid end of June and
          end of December on the trailing 6 months.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Payout:</span>
        {periodOptions(now).map((p) => (
          <Link
            key={p}
            href={`/admin/tenure-bonus?period=${p}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              p === periodKey ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            {p}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.label}</CardTitle>
          <CardDescription>
            Window {t.windowStart} → {t.windowEnd} · payout {t.payoutDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PoolInput periodKey={t.periodKey} poolAmount={t.poolAmount} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Pool (entered)" value={money(t.poolAmount)} />
            <Stat label="Damages (window)" value={`− ${money(t.damages)}`} />
            <Stat label="Net pool" value={money(t.netPool)} highlight />
            <Stat label="Total shares" value={`${t.totalShares} mo`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payouts by tenure</CardTitle>
          <CardDescription>
            {t.rows.length} active employees · 1 month of tenure = 1 share
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Shares (months)</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead className="text-right">Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.months}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.sharePct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-medium">{money(r.payout)}</TableCell>
                </TableRow>
              ))}
              {t.rows.length > 0 && (
                <TableRow className="font-semibold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{t.totalShares}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">
                    {money(t.rows.reduce((s, r) => s + r.payout, 0))}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">
            First payout: December 2026 (Jun–Nov 2026). These amounts drop onto each person&apos;s
            paycheck for the payout pay period — wiring into the Payroll Run comes next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}
