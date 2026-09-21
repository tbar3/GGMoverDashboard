'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LIVE_AREAS } from '@/lib/nav';
import { resolveActiveNav, panelItems, groupNavItems } from '@/lib/nav-active';

/**
 * The second column: the modules of whichever area you are currently in.
 *
 * It is always present rather than sliding in and out. A panel that appears on
 * navigation shifts the entire page sideways every time you change area, and the
 * width has to be a constant the layout can reserve — a server layout cannot
 * reliably know the pathname to size itself.
 *
 * On the hub (or anywhere outside a known area) it lists the areas themselves,
 * so the column is never an empty 224px of nothing.
 */

const link = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const active = 'bg-sidebar-primary text-sidebar-primary-foreground';
const idle =
  'text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

export function AreaPanel({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { area } = resolveActiveNav(pathname);

  if (!area) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          Areas
        </p>
        {LIVE_AREAS.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.key} href={a.href ?? '#'} className={cn(link, idle)}>
              <Icon className="h-5 w-5" />
              {a.label}
            </Link>
          );
        })}
      </div>
    );
  }

  const groups = groupNavItems(panelItems(area));

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <Link
        href={area.href ?? '#'}
        className={cn(
          link,
          'mb-2',
          pathname === area.href ? active : idle
        )}
      >
        <area.icon className="h-5 w-5" />
        <span className="font-semibold">{area.label}</span>
      </Link>

      {groups.map((group) => (
        <div key={group.name ?? 'ungrouped'} className="mt-4 space-y-1">
          {group.name && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              {group.name}
            </p>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const count = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(link, isActive ? active : idle)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.title}</span>
                {count > 0 && (
                  <span
                    aria-label={`${count} need attention`}
                    className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white"
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
