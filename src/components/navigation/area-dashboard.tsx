import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import type { NavArea } from '@/lib/nav';
import { panelItems, groupNavItems } from '@/lib/nav-active';

/**
 * The shared body of an area dashboard: a few live numbers, then every module in
 * the area as a card.
 *
 * The cards are generated from the nav config, not hand-written. A new module
 * added to nav.ts appears in the rail, its flyout, the panel, the mobile
 * accordion AND here — so there is no fourth place to forget.
 *
 * A server component: it renders links and cards, and nav-active is pure.
 */

export interface AreaStat {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  href?: string;
}

export function AreaDashboard({
  area,
  stats,
  asOf,
  children,
}: {
  area: NavArea;
  stats: AreaStat[];
  /** e.g. "jobs data as of Sep 17" — a number with no date is a number you cannot trust. */
  asOf?: string | null;
  children?: React.ReactNode;
}) {
  const groups = groupNavItems(panelItems(area));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{area.label}</h1>
        <p className="text-muted-foreground mt-1">
          {area.description}
          {asOf ? ` · as of ${asOf}` : ''}
        </p>
      </div>

      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <AreaStatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      {children}

      {groups.map((group) => (
        <div key={group.name ?? 'ungrouped'}>
          {group.name && (
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className="h-full transition-colors hover:bg-muted">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-semibold">{item.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AreaStatCard({ icon: Icon, label, value, sub, href }: AreaStat) {
  const inner = (
    <Card className={`h-full ${href ? 'cursor-pointer transition-colors hover:bg-muted' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        <p className="mt-1 text-3xl font-bold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
