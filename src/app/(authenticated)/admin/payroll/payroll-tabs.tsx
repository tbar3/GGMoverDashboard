import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The payroll tab bar.
 *
 * Deliberately NOT a client component.
 *
 * It was one, using usePathname() and useSearchParams() to rebuild each link.
 * That broke production: page.tsx is a Server Component and imports PAYROLL_TABS
 * from here, but Next replaces the exports of a 'use client' module with client
 * reference proxies across that boundary. Components survive the trip; plain data
 * does not — so `PAYROLL_TABS.some(...)` threw "some is not a function" on every
 * request, and nothing in tsc, lint or the build could see it.
 *
 * Neither hook was needed anyway: the route is fixed, and the server already
 * knows the active tab and the selected week. With no hooks this renders on the
 * server, and the constant below is a plain module export again.
 */
export const PAYROLL_TABS = [
  { key: 'run', label: 'Run' },
  { key: 'hours', label: 'Hours' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'audit', label: 'Audit' },
  { key: 'history', label: 'History' },
] as const;

export type PayrollTabKey = (typeof PAYROLL_TABS)[number]['key'];

const BASE_PATH = '/admin/payroll';

export function PayrollTabs({ active, week }: { active: PayrollTabKey; week: string | null }) {
  function href(key: string) {
    const params = new URLSearchParams({ tab: key });
    // Carry the selected week across tabs, so switching to Audit shows the week
    // you were reviewing rather than silently jumping to the newest.
    if (week) params.set('week', week);
    return `${BASE_PATH}?${params.toString()}`;
  }

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex flex-wrap gap-1" aria-label="Payroll sections">
        {PAYROLL_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={href(tab.key)}
            aria-current={active === tab.key ? 'page' : undefined}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
