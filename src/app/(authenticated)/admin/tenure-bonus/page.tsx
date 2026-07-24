import { getTenureBonus, currentPeriod } from '@/lib/tenure-bonus';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function TenureBonusPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; half?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const def = currentPeriod(now);
  const year = sp.year ? parseInt(sp.year, 10) : def.year;
  const half: 1 | 2 = sp.half === '1' ? 1 : sp.half === '2' ? 2 : def.half;

  const b = await getTenureBonus(year, half);

  const prev = half === 1 ? { year: year - 1, half: 2 } : { year, half: 1 };
  const next = half === 2 ? { year: year + 1, half: 1 } : { year, half: 2 };
  const href = (p: { year: number; half: number }) => `/admin/tenure-bonus?year=${p.year}&half=${p.half}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bi-Annual Tenure Bonus</h1>
          <p className="text-muted-foreground mt-1">
            1% of estimated revenue, less damages, split by months worked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(prev)}>
            <Button variant="outline" size="icon" aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="font-semibold min-w-[8rem] text-center">{b.label}</span>
          <Link href={href(next)}>
            <Button variant="outline" size="icon" aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Pool math */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Estimated revenue" value={money(b.estimatedRevenue)} sub="jobs this period" />
        <StatCard label="Pool (1%)" value={money(b.grossPool)} />
        <StatCard label="Less damages" value={`- ${money(b.damages)}`} sub="unreported count 2×" />
        <StatCard label="Net pool to split" value={money(b.netPool)} highlight />
      </div>

      {/* Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Payout by Tenure</CardTitle>
          <CardDescription>
            {b.totalMonths} total months across {b.rows.length}{' '}
            {b.rows.length === 1 ? 'person' : 'people'} · 1 month = 1 share
          </CardDescription>
        </CardHeader>
        <CardContent>
          {b.netPool === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nothing to pay out this period — the pool after damages is $0.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crew member</TableHead>
                  <TableHead className="text-right">Months</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.months}</TableCell>
                    <TableCell className="text-right">{r.sharePct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-medium">{money(r.payout)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{b.totalMonths}</TableCell>
                  <TableCell className="text-right font-semibold">100%</TableCell>
                  <TableCell className="text-right font-semibold">{money(b.netPool)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-primary' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
