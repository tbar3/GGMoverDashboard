'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClosedWeekRow } from '@/lib/payroll-history';

/**
 * Gross payroll and bonus as bars, labor ratio as a line on its own axis.
 *
 * Two axes because the quantities are not comparable — dollars in the thousands
 * against a percentage in the tens. Plotting them on one axis would flatten the
 * ratio into a line along the bottom and hide the thing most worth watching.
 */
export function PayrollTrendChart({ data }: { data: ClosedWeekRow[] }) {
  if (data.length < 2) return null;

  const points = data.map((w) => ({
    week: w.weekStart.slice(5),
    gross: w.grossPayroll,
    bonus: w.bonusTotal,
    labor: w.laborRatio,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend</CardTitle>
        <CardDescription>
          The last {data.length} closed weeks. Bars are dollars, the line is labor as a percent of
          revenue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis
                yAxisId="money"
                tick={{ fontSize: 12 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 12 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--popover-foreground)',
                }}
                formatter={(value, name) => {
                  const n = Number(value ?? 0);
                  return name === 'Labor %'
                    ? [`${n.toFixed(1)}%`, name]
                    : [`$${n.toFixed(2)}`, name];
                }}
              />
              <Legend />
              <Bar yAxisId="money" dataKey="gross" name="Gross payroll" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="money" dataKey="bonus" name="Bonus" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="labor"
                name="Labor %"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
