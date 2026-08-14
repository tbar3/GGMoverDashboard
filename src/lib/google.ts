import { google } from 'googleapis';
import { query, queryOne } from './db';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  // Read the business's own Google reviews (Business Profile API). Requires the
  // Cloud project to be granted Basic API access; adding it here means the next
  // consent re-issues a token carrying both scopes.
  'https://www.googleapis.com/auth/business.manage',
];

export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * The single shared, authorized OAuth2 client (or null if Google isn't connected).
 * Loads the one stored token and wires up refresh-persistence, so any Google API —
 * Calendar, Business Profile — can reuse the same credentials with no user present.
 */
export async function getGoogleAuthClient() {
  const stored = await queryOne<{
    access_token: string;
    refresh_token: string;
    expiry_date: string;
  }>('SELECT access_token, refresh_token, expiry_date FROM google_tokens ORDER BY created_at DESC LIMIT 1');

  if (!stored) return null;

  oauth2Client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: parseInt(stored.expiry_date),
  });

  // Listen for token refresh so we persist the new access token
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await query(
        `UPDATE google_tokens SET access_token = $1, expiry_date = $2 WHERE refresh_token = $3`,
        [tokens.access_token, String(tokens.expiry_date ?? '0'), stored.refresh_token]
      );
    }
  });

  return oauth2Client;
}

export async function getCalendarClient() {
  const auth = await getGoogleAuthClient();
  if (!auth) return null;
  return google.calendar({ version: 'v3', auth });
}

export async function storeTokens(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  // Delete old tokens and store new ones
  await query('DELETE FROM google_tokens');
  await query(
    `INSERT INTO google_tokens (access_token, refresh_token, expiry_date)
     VALUES ($1, $2, $3)`,
    [tokens.access_token ?? '', tokens.refresh_token ?? '', String(tokens.expiry_date ?? '0')]
  );
}
