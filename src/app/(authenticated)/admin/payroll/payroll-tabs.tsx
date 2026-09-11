'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The payroll tab bar.
 *
 * Tabs are URL state, not component state: the week you are looking at and the
 * tab you are on both survive a refresh, a bookmark, and the back button — which
 * matters because payroll is a thing people leave half-done and come back to.
 */
export const PAYROLL_TABS = [
  { key: 'run', label: 'Run' },
  { key: 'hours', label: 'Hours' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'audit', label: 'Audit' },
  { key: 'history', label: 'History' },
] as const;

export type PayrollTabKey = (typeof PAYROLL_TABS)[number]['key'];

export function PayrollTabs({ active, week }: { active: PayrollTabKey; week: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    // Carry the selected week across tabs, so switching to Audit shows the same
    // week you were reviewing rather than silently jumping to the newest.
    if (week) next.set('week', week);
    return `${pathname}?${next.toString()}`;
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
