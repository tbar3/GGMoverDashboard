import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getClosedRun, getPayrollRunWeeks } from '@/lib/payroll-run';
import { PayrollTabs, PAYROLL_TABS, type PayrollTabKey } from './payroll-tabs';
import { WeekStatusBar } from './week-status-bar';
import { RunTab } from './run-tab';
import { HoursTab } from './hours-tab';
import { MarketingTab } from './marketing-tab';
import { AuditTab } from './audit-tab';
import { HistoryTab } from './history-tab';

// Every figure here is derived from the current week's data; nothing is cacheable.
export const dynamic = 'force-dynamic';

/**
 * Payroll, in one place.
 *
 * This page replaces what used to be four separate routes (/payroll,
 * /payroll/run, /payroll/audit, /payroll/marketing). Those paths still resolve —
 * they redirect here with the matching tab — so old links and bookmarks keep
 * working.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; week?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const { tab, week } = await searchParams;
  const active: PayrollTabKey = PAYROLL_TABS.some((t) => t.key === tab)
    ? (tab as PayrollTabKey)
    : 'run';

  const weeks = await getPayrollRunWeeks();
  const weekStart = week ?? weeks[0]?.weekStart ?? null;
  // Fetched once here rather than inside each tab: the closed/open state belongs
  // to the week, not to whichever tab happens to be showing.
  const closed = weekStart ? await getClosedRun(weekStart) : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payroll</h1>
        <p className="text-muted-foreground mt-1">
          Import hours, review and correct, close the week, and export it — plus the audit trail and
          the running record.
        </p>
      </div>

      <PayrollTabs active={active} week={weekStart} />

      {weekStart && active !== 'history' && (
        <WeekStatusBar weekStart={weekStart} closed={closed} />
      )}

      {active === 'run' && <RunTab weekStart={weekStart} />}
      {active === 'hours' && <HoursTab />}
      {active === 'marketing' && <MarketingTab weekStart={weekStart} />}
      {active === 'audit' && <AuditTab weekStart={weekStart} />}
      {active === 'history' && <HistoryTab />}
    </div>
  );
}
