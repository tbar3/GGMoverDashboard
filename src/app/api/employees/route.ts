import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
  const rows = activeOnly
    ? await query('SELECT * FROM employees WHERE is_active = true ORDER BY name')
    : await query('SELECT * FROM employees ORDER BY name');

  return NextResponse.json(rows);
}
