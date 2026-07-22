import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
  const rows = activeOnly
    ? await query('SELECT * FROM employees WHERE is_active = true ORDER BY name')
    : await query('SELECT * FROM employees ORDER BY name');

  return NextResponse.json(rows);
}
