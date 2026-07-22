import { getTokensFromCode, storeTokens } from '@/lib/google';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.redirect(new URL('/login', request.url));
  if (!isBackOffice(employee)) return NextResponse.redirect(new URL('/dashboard', request.url));

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
