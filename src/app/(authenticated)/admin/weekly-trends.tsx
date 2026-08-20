import type { WeeklyTrendPoint } from '@/lib/payroll-run';

// Self-contained SVG line chart (server-renderable, no chart library).
interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

function LineChart({
  labels,
  series,
  formatY,
}: {
  labels: string[];
  series: Series[];
  formatY: (n: number) => string;
}) {
  const W = 640;
  const H = 200;
  const padL = 56;
  const padR = 14;
  const padT = 12;
  const padB = 30;
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = niceMax(Math.max(...all, 0));
  const x = (i: number) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {/* gridlines + y labels */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} className="stroke-border" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {formatY(t)}
          </text>
        </g>
      ))}
      {/* x labels */}
      {labels.map((lab, i) =>
        n > 8 && i % 2 === 1 ? null : (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {lab}
          </text>
        )
      )}
      {/* series */}
      {series.map((s) => {
        const pts = s.values
          .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
          .filter((p): p is string => p != null)
          .join(' ');
        return (
          <g key={s.name}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.values.map((v, i) =>
              v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

const REVENUE_COLOR = '#22c55e';
const PAYROLL_COLOR = '#3b82f6';
const RATIO_COLOR = '#f59e0b';

function money(n: number | null): string {
  return n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function pct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

export function WeeklyTrends({ points }: { points: WeeklyTrendPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Not enough history yet — trends appear once at least two weeks have data. Enter jobs &amp;
        revenue on the Payroll Run each week and this fills in.
      </p>
    );
  }
  const labels = points.map((p) => p.weekLabel);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Legend items={[{ name: 'Revenue', color: REVENUE_COLOR }, { name: 'Payroll gross', color: PAYROLL_COLOR }]} />
        <LineChart
          labels={labels}
          formatY={(n) => `$${Math.round(n / 1000)}k`}
          series={[
            { name: 'Revenue', color: REVENUE_COLOR, values: points.map((p) => p.revenue) },
            { name: 'Payroll gross', color: PAYROLL_COLOR, values: points.map((p) => p.payrollGross) },
          ]}
        />
      </div>

      <div className="space-y-2">
        <Legend items={[{ name: 'Labor-cost ratio', color: RATIO_COLOR }]} />
        <LineChart
          labels={labels}
          formatY={(n) => `${Math.round(n)}%`}
          series={[{ name: 'Labor-cost ratio', color: RATIO_COLOR, values: points.map((p) => p.laborRatio) }]}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1.5 pr-4">Week</th>
              <th className="py-1.5 pr-4 text-right">Jobs</th>
              <th className="py-1.5 pr-4 text-right">Revenue</th>
              <th className="py-1.5 pr-4 text-right">Payroll gross</th>
              <th className="py-1.5 text-right">Labor ratio</th>
            </tr>
          </thead>
          <tbody>
            {points
              .slice()
              .reverse()
              .map((p) => (
                <tr key={p.weekStart} className="border-b last:border-0">
                  <td className="py-1.5 pr-4 font-medium">{p.weekLabel}</td>
                  <td className="py-1.5 pr-4 text-right">{p.jobs ?? '—'}</td>
                  <td className="py-1.5 pr-4 text-right">{money(p.revenue)}</td>
                  <td className="py-1.5 pr-4 text-right">{money(p.payrollGross)}</td>
                  <td className="py-1.5 text-right">{pct(p.laborRatio)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
