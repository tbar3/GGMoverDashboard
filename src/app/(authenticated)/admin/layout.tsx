import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';

/**
 * Server-side guard for the ENTIRE /admin tree.
 *
 * The admin pages are client components, so they cannot protect themselves — this
 * layout runs on the server before any of them render. A crew member (or anyone who
 * is not back office) who navigates to any /admin/* URL is bounced to their own home.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect('/login');
  }

  if (!isBackOffice(employee)) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
