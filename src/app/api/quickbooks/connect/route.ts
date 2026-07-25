import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { isConfigured, getAuthorizeUrl } from '@/lib/quickbooks';

// Kick off the QuickBooks OAuth consent flow. Sets a CSRF state cookie and sends
// the admin to Intuit; Intuit redirects back to /api/quickbooks/callback.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  if (!isConfigured()) {
    return NextResponse.redirect(new URL('/admin/quickbooks?error=not_configured', request.url));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getAuthorizeUrl(state));
  res.cookies.set('qb_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
