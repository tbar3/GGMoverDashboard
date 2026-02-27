import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/navigation/sidebar';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get employee info to determine admin status
  const { data: employee } = await supabase
    .from('employees')
    .select('name, is_admin, role')
    .eq('email', user.email)
    .single();

  const isAdmin = employee?.is_admin || employee?.role === 'owner' || employee?.role === 'manager';
  const userName = employee?.name || user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isAdmin={isAdmin} userName={userName} />
      <main className="lg:pl-64">
        <div className="pt-16 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
