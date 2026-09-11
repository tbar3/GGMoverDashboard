import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { queryOne } from '@/lib/db';
import { Sidebar } from '@/components/navigation/sidebar';
import { I18nWrapper } from '@/components/providers/i18n-provider';
import { Employee } from '@/types';
import { isBackOffice } from '@/lib/auth';
import { getComplianceBadgeCount } from '@/lib/compliance/queries';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const email = user.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Pick<Employee, 'name' | 'is_admin' | 'role'>>(
    'SELECT name, is_admin, role FROM employees WHERE email = $1',
    [email]
  );

  const isAdmin = isBackOffice(employee);
  const userName = employee?.name || email?.split('@')[0] || 'User';

  // Computed here rather than on the compliance page itself: with no reminder
  // emails, this badge is the ONLY thing that says something has lapsed, so it
  // has to be visible from every page — not just the one you'd have to already
  // be worried to visit. It is one query, and only for back office.
  const complianceCount = isAdmin ? await getComplianceBadgeCount() : 0;

  return (
    <I18nWrapper>
      <div className="min-h-screen bg-muted">
        <Sidebar isAdmin={isAdmin} userName={userName} badges={{ compliance: complianceCount }} />
        <main className="lg:pl-64">
          <div className="pt-16 lg:pt-0">
            {children}
          </div>
        </main>
      </div>
    </I18nWrapper>
  );
}
