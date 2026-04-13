import { currentUser } from '@clerk/nextjs/server';
import { getAuthUrl } from '@/lib/google';
import { NextResponse } from 'next/server';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
