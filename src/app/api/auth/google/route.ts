import { getAuthUrl } from '@/lib/google';
import { NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET() {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
