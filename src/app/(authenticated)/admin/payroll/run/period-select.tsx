'use client';

import { useRouter } from 'next/navigation';

/** Dropdown to switch the payroll period (each option is an imported week). */
export function PeriodSelect({
  weeks,
  weekStart,
  basePath = '/admin/payroll/run',
}: {
  weeks: { weekStart: string; label: string }[];
  weekStart: string;
  /** Where the selection navigates — lets the audit view reuse this control. */
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <select
      value={weekStart}
      onChange={(e) => router.push(`${basePath}?week=${e.target.value}`)}
      className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {weeks.map((w) => (
        <option key={w.weekStart} value={w.weekStart}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
