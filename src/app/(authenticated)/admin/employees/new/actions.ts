'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { UserRole } from '@/types';

interface CreateEmployeeInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  startDate: string;
  isAdmin: boolean;
}

export async function createEmployee(input: CreateEmployeeInput) {
  // Verify the calling user is an admin
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('is_admin, role')
    .eq('email', user.email)
    .single();

  const isCallerAdmin = currentEmployee?.is_admin ||
    currentEmployee?.role === 'owner' ||
    currentEmployee?.role === 'manager';

  if (!isCallerAdmin) {
    return { error: 'Only admins can create employees' };
  }

  // Use the service role key to create the auth user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: authError } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError) {
    return { error: authError.message };
  }

  // Create the employee record
  const { error: employeeError } = await supabase.from('employees').insert({
    email: input.email,
    name: input.name,
    role: input.role,
    start_date: input.startDate,
    is_active: true,
    is_admin: input.isAdmin || input.role === 'owner' || input.role === 'manager',
  });

  if (employeeError) {
    return { error: employeeError.message };
  }

  return { success: true };
}
