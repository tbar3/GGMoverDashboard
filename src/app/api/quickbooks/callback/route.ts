import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { exchangeCodeForTokens } from '@/lib/quickbooks';

// Intuit redirects here after consent with ?code, ?realmId, ?state. We verify the
// CSRF state, exchange the code for tokens, and persist the connection.
export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const sp = request.nextUrl.searchParams;
  const dest = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/quickbooks?${q}`, request.url));
    res.cookies.delete('qb_oauth_state');
    return res;
  };

  if (sp.get('error')) return dest(`error=${encodeURIComponent(sp.get('error') as string)}`);

  const code = sp.get('code');
  const realmId = sp.get('realmId');
  const state = sp.get('state');
  const cookieState = request.cookies.get('qb_oauth_state')?.value;

  if (!code || !realmId) return dest('error=missing_params');
  if (!state || !cookieState || state !== cookieState) return dest('error=state_mismatch');

  try {
    await exchangeCodeForTokens(code, realmId, guard.employee.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 140) : 'exchange_failed';
    return dest(`error=${encodeURIComponent(msg)}`);
  }

  return dest('connected=1');
}
