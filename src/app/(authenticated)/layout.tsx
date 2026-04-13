import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { queryOne } from '@/lib/db';
import { Sidebar } from '@/components/navigation/sidebar';
import { I18nWrapper } from '@/components/providers/i18n-provider';
import { Employee } from '@/types';

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

  const isAdmin = employee?.is_admin || employee?.role === 'owner' || employee?.role === 'manager';
  const userName = employee?.name || email?.split('@')[0] || 'User';

  return (
    <I18nWrapper>
      <div className="min-h-screen bg-gray-50">
        <Sidebar isAdmin={isAdmin} userName={userName} />
        <main className="lg:pl-64">
          <div className="pt-16 lg:pt-0">
            {children}
          </div>
        </main>
      </div>
    </I18nWrapper>
  );
}
