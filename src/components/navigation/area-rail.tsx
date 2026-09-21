'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIVE_AREAS, type NavArea } from '@/lib/nav';
import { resolveActiveNav, panelItems, groupNavItems, areaHasBadge } from '@/lib/nav-active';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

/**
 * The area rail — one entry per back-office area, always visible.
 *
 * Hovering (or tabbing to) an entry opens a flyout of that area's modules, so
 * you can look into Materials without leaving Payroll. Clicking navigates to the
 * area's dashboard. Which entry is lit comes from the URL via resolveActiveNav,
 * never from state held here.
 */

const HUB = { label: 'Hub', href: '/admin' };

const railItem =
  'flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition-colors';
const railActive = 'bg-sidebar-primary text-sidebar-primary-foreground';
const railIdle =
  'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

export function AreaRail({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { area: activeArea } = resolveActiveNav(pathname);

  return (
    <div className="flex h-full w-[72px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Areas">
        <Link
          href={HUB.href}
          aria-current={pathname === HUB.href ? 'page' : undefined}
          className={cn(railItem, pathname === HUB.href ? railActive : railIdle)}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-center">{HUB.label}</span>
        </Link>

        {LIVE_AREAS.map((area) => (
          <AreaRailEntry
            key={area.key}
            area={area}
            active={activeArea?.key === area.key}
            badges={badges}
          />
        ))}
      </nav>
    </div>
  );
}

function AreaRailEntry({
  area,
  active,
  badges,
}: {
  area: NavArea;
  active: boolean;
  badges?: Record<string, number>;
}) {
  const Icon = area.icon;
  // Where an area is a single module, panelItems() is empty — there is nothing to
  // flyout to that the rail entry itself does not already go to.
  const items = panelItems(area);
  const groups = groupNavItems(items);
  const needsAttention = areaHasBadge(area, badges);

  const trigger = (
    <Link
      href={area.href ?? '#'}
      aria-current={active ? 'page' : undefined}
      className={cn(railItem, 'relative', active ? railActive : railIdle)}
    >
      <Icon className="h-5 w-5" />
      <span className="text-center">{area.label}</span>
      {/* The rail hides a whole area behind one entry, which would also hide the
          badge that exists to shout. A dot keeps it visible without repeating a
          count that has no context at this level. */}
      {needsAttention && (
        <span
          aria-label="Needs attention"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
        />
      )}
    </Link>
  );

  if (items.length === 0) return trigger;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="right" className="w-72">
        <p className="px-2 pb-1 text-sm font-semibold">{area.label}</p>
        <p className="px-2 pb-2 text-xs text-muted-foreground">{area.description}</p>
        {groups.map((group) => (
          <div key={group.name ?? 'ungrouped'} className="pt-1">
            {group.name && (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.name}
              </p>
            )}
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              const count = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.title}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-destructive px-1.5 text-xs font-semibold text-white">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}
