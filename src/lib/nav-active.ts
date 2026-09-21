/**
 * Which part of the nav the current URL belongs to.
 *
 * Pure, and deliberately in its own file: the two-level nav decides what to
 * expand from the pathname rather than from component state, so this function is
 * the single answer to "where am I?" for the rail, the panel, the mobile
 * accordion and every area dashboard. State that lives in a component can
 * disagree with the page you are actually on; a URL cannot.
 */

import { LIVE_AREAS, type NavArea, type NavItem } from '@/lib/nav';

export interface ActiveNav {
  area: NavArea | null;
  item: NavItem | null;
}

/** Does `pathname` sit at or below `href`? */
function covers(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Resolve the active area and module.
 *
 * LONGEST match wins, which is the whole point: `/admin/compliance/items` is
 * covered by both `/admin/compliance` and `/admin/compliance/items`, and the
 * shorter one would light up the wrong link and leave the real page looking
 * unlisted. Items are checked before area dashboards for the same reason.
 */
export function resolveActiveNav(pathname: string, areas: NavArea[] = LIVE_AREAS): ActiveNav {
  let best: ActiveNav = { area: null, item: null };
  let bestLength = -1;

  for (const area of areas) {
    for (const item of area.items) {
      if (covers(pathname, item.href) && item.href.length > bestLength) {
        best = { area, item };
        bestLength = item.href.length;
      }
    }
  }

  if (best.area) return best;

  // No module matched — we may still be on an area's own dashboard.
  for (const area of areas) {
    if (area.href && covers(pathname, area.href) && area.href.length > bestLength) {
      best = { area, item: null };
      bestLength = area.href.length;
    }
  }

  return best;
}

/**
 * The modules to list for an area.
 *
 * Where the area's dashboard IS one of its modules (Materials, Policies,
 * Compliance), that module is dropped: the rail entry already goes there, and
 * listing it again below itself reads like a mistake.
 */
export function panelItems(area: NavArea): NavItem[] {
  if (area.items.length <= 1) return [];
  return area.items.filter((item) => item.href !== area.href);
}

export interface NavGroup {
  /** null for items declared without a group; always rendered first. */
  name: string | null;
  items: NavItem[];
}

/**
 * Bucket an area's modules by `group`, preserving declaration order.
 *
 * Declaration order, not alphabetical: the order in nav.ts is editorial — Daily
 * before Revenue before Data is how the work actually runs.
 */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const name = item.group ?? null;
    const existing = groups.find((g) => g.name === name);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ name, items: [item] });
    }
  }
  // Ungrouped items lead, whatever order they were declared in.
  return groups.sort((a, b) => (a.name === null ? -1 : b.name === null ? 1 : 0));
}

/**
 * Does anything inside this area need attention?
 *
 * The rail collapses a whole area to one entry, which would otherwise hide the
 * badge that exists specifically to shout. A dot on the rail keeps it visible
 * without reproducing the count at a level where it has no context.
 */
export function areaHasBadge(area: NavArea, badges?: Record<string, number>): boolean {
  if (!badges) return false;
  return area.items.some((item) => (item.badgeKey ? (badges[item.badgeKey] ?? 0) > 0 : false));
}
