'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIVE_AREAS } from '@/lib/nav';
import { resolveActiveNav, panelItems, groupNavItems, areaHasBadge } from '@/lib/nav-active';

/**
 * The touch variant of the two-level nav.
 *
 * There is no hover on a phone, so the flyout cannot exist here. Same config,
 * same structure, one column: tap an area to expand its modules. The area you
 * are currently in starts expanded, so the sheet opens showing where you are.
 */

const link = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const activeClass = 'bg-sidebar-primary text-sidebar-primary-foreground';
const idleClass =
  'text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

export function AreaAccordion({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { area: activeArea } = resolveActiveNav(pathname);
  const [openKey, setOpenKey] = useState<string | null>(activeArea?.key ?? null);

  return (
    <div className="space-y-1">
      <Link
        href="/admin"
        className={cn(link, pathname === '/admin' ? activeClass : idleClass)}
      >
        <LayoutDashboard className="h-5 w-5" />
        Company Hub
      </Link>

      {LIVE_AREAS.map((area) => {
        const Icon = area.icon;
        const items = panelItems(area);
        const isOpen = openKey === area.key;
        const needsAttention = areaHasBadge(area, badges);

        // A single-module area has nothing to expand into — link straight to it,
        // the same way the rail does.
        if (items.length === 0) {
          return (
            <Link
              key={area.key}
              href={area.href ?? '#'}
              className={cn(link, activeArea?.key === area.key ? activeClass : idleClass)}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1">{area.label}</span>
              {needsAttention && <span className="h-2 w-2 rounded-full bg-destructive" />}
            </Link>
          );
        }

        return (
          <div key={area.key}>
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : area.key)}
              aria-expanded={isOpen}
              className={cn(link, 'w-full', idleClass)}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1 text-left">{area.label}</span>
              {needsAttention && <span className="h-2 w-2 rounded-full bg-destructive" />}
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {isOpen && (
              <div className="ml-4 border-l border-sidebar-border pl-2">
                <Link
                  href={area.href ?? '#'}
                  className={cn(
                    link,
                    'text-xs',
                    pathname === area.href ? activeClass : idleClass
                  )}
                >
                  {area.label} dashboard
                </Link>
                {groupNavItems(items).map((group) => (
                  <div key={group.name ?? 'ungrouped'} className="mt-2 space-y-1">
                    {group.name && (
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                        {group.name}
                      </p>
                    )}
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const count = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
                      const isActive =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(link, isActive ? activeClass : idleClass)}
                        >
                          <ItemIcon className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.title}</span>
                          {count > 0 && (
                            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">
                              {count}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
