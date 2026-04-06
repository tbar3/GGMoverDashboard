import { currentUser } from '@clerk/nextjs/server';
import { queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';
import { Employee } from '@/types';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const email = user.emailAddresses[0]?.emailAddress;
  const employee = await queryOne<Employee>('SELECT * FROM employees WHERE email = $1', [email]);

  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  return NextResponse.json(employee);
}
