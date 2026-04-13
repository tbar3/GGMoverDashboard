import { currentUser } from '@clerk/nextjs/server';
import { getTokensFromCode, storeTokens } from '@/lib/google';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/admin?error=no_code', request.url));
  }

  try {
    const tokens = await getTokensFromCode(code);
    await storeTokens(tokens);
    return NextResponse.redirect(new URL('/admin/calendar?connected=true', request.url));
  } catch (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(new URL('/admin?error=google_auth_failed', request.url));
  }
}
