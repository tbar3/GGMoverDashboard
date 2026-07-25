import { query, queryOne } from '@/lib/db';

/**
 * QuickBooks Online integration (OAuth 2.0).
 *
 * Credentials come from env so nothing secret lives in code:
 *   QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET
 *   QUICKBOOKS_REDIRECT_URI   (e.g. https://goodguys-dashboard.vercel.app/api/quickbooks/callback)
 *   QUICKBOOKS_ENVIRONMENT    ('sandbox' | 'production', default 'production')
 *
 * Tokens are stored in quickbooks_connection (single row). Access tokens last ~1h
 * and are refreshed automatically; refresh tokens last ~100 days.
 */

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';

export function qbConfig() {
  return {
    clientId: process.env.QUICKBOOKS_CLIENT_ID ?? '',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? '',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI ?? '',
    environment: (process.env.QUICKBOOKS_ENVIRONMENT ?? 'production').toLowerCase(),
  };
}

/** True once the env credentials are present (so the UI can guide setup otherwise). */
export function isConfigured(): boolean {
  const c = qbConfig();
  return !!(c.clientId && c.clientSecret && c.redirectUri);
}

export function apiBase(environment: string): string {
  return environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

/** Step 1: the Intuit consent URL to send the admin to. */
export function getAuthorizeUrl(state: string): string {
  const c = qbConfig();
  const params = new URLSearchParams({
    client_id: c.clientId,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: c.redirectUri,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const c = qbConfig();
  return 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (~3600)
  x_refresh_token_expires_in: number; // seconds (~8726400)
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Step 2 (callback): exchange the auth code for tokens and persist them. */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string,
  connectedBy: string | null
): Promise<void> {
  const c = qbConfig();
  const tokens = await postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.redirectUri,
    })
  );
  await persistTokens(realmId, tokens, connectedBy);
}

async function persistTokens(
  realmId: string,
  tokens: TokenResponse,
  connectedBy: string | null
): Promise<void> {
  const accessExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000).toISOString();
  await query(
    `INSERT INTO quickbooks_connection
       (id, realm_id, access_token, refresh_token, access_expires_at, refresh_expires_at, connected_at, connected_by)
     VALUES (1, $1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (id) DO UPDATE SET
       realm_id = EXCLUDED.realm_id,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       access_expires_at = EXCLUDED.access_expires_at,
       refresh_expires_at = EXCLUDED.refresh_expires_at,
       connected_at = COALESCE(quickbooks_connection.connected_at, NOW()),
       connected_by = COALESCE(EXCLUDED.connected_by, quickbooks_connection.connected_by)`,
    [realmId, tokens.access_token, tokens.refresh_token, accessExpires, refreshExpires, connectedBy]
  );
}

export interface QbConnection {
  realmId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export async function getConnection(): Promise<QbConnection | null> {
  const row = await queryOne<{
    realm_id: string | null;
    access_token: string | null;
    refresh_token: string | null;
    access_expires_at: string | null;
    refresh_expires_at: string | null;
    connected_at: string | null;
    last_sync_at: string | null;
  }>('SELECT * FROM quickbooks_connection WHERE id = 1');
  if (!row || !row.realm_id) return null;
  return {
    realmId: row.realm_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  };
}

export async function isConnected(): Promise<boolean> {
  return (await getConnection()) != null;
}

/** A valid access token, refreshing via the refresh token if the current one is stale. */
export async function getValidAccessToken(): Promise<string> {
  const conn = await getConnection();
  if (!conn || !conn.accessToken || !conn.refreshToken) {
    throw new Error('QuickBooks is not connected');
  }
  const expiresAt = conn.accessExpiresAt ? new Date(conn.accessExpiresAt).getTime() : 0;
  // Refresh if it expires within the next 60s.
  if (expiresAt - Date.now() > 60_000) return conn.accessToken;

  const tokens = await postToken(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
  );
  await persistTokens(conn.realmId as string, tokens, null);
  return tokens.access_token;
}

export async function disconnect(): Promise<void> {
  // Best-effort token revoke, then clear our row.
  try {
    const conn = await getConnection();
    if (conn?.refreshToken) {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ token: conn.refreshToken }),
      });
    }
  } catch {
    // ignore revoke failures — we still clear locally
  }
  await query('DELETE FROM quickbooks_connection WHERE id = 1');
}

/** Authenticated GET against the QBO API (auto-refreshes the token). */
export async function qboGet<T = unknown>(path: string): Promise<T> {
  const conn = await getConnection();
  if (!conn?.realmId) throw new Error('QuickBooks is not connected');
  const token = await getValidAccessToken();
  const base = apiBase(qbConfig().environment);
  const res = await fetch(`${base}/v3/company/${conn.realmId}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QuickBooks API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/** Connection test — pulls the company profile to prove the link works. */
export async function getCompanyInfo(): Promise<{ name: string | null; legalName: string | null }> {
  const conn = await getConnection();
  if (!conn?.realmId) throw new Error('QuickBooks is not connected');
  const data = await qboGet<{
    CompanyInfo?: { CompanyName?: string; LegalName?: string };
  }>(`companyinfo/${conn.realmId}?minorversion=73`);
  return {
    name: data.CompanyInfo?.CompanyName ?? null,
    legalName: data.CompanyInfo?.LegalName ?? null,
  };
}

export async function markSynced(): Promise<void> {
  await query('UPDATE quickbooks_connection SET last_sync_at = NOW() WHERE id = 1');
}

// ── Sync (next phase, once connected & tested) ────────────────
//
// pullProfitAndLoss(year, month): GET reports/ProfitAndLoss?start_date=..&end_date=..
//   → map expense rows into operating_costs (overhead / debt / salary), replacing the
//     manual entries for that month.
// pushPayroll(weekStart): create a JournalEntry (or Bill) in QBO for that week's
//   gross_pay by employee, so wages land in the QBO books.
//
// Both are structured but intentionally deferred until we can exercise them against
// a real connected company. The auth/token/client plumbing above is what they build on.
