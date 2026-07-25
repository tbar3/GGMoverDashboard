import { isConfigured, getConnection, qbConfig } from '@/lib/quickbooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Link2, ArrowRightLeft } from 'lucide-react';
import { format } from 'date-fns';
import { QuickBooksControls } from './controls';

export const dynamic = 'force-dynamic';

const REDIRECT_URI = 'https://goodguys-dashboard.vercel.app/api/quickbooks/callback';

export default async function QuickBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const configured = isConfigured();
  const conn = configured ? await getConnection() : null;
  const env = qbConfig().environment;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">QuickBooks</h1>
        <p className="text-muted-foreground mt-1">
          Two-way sync with QuickBooks Online — pull financials in, push payroll out.
        </p>
      </div>

      {sp.connected && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" /> QuickBooks connected.
        </div>
      )}
      {sp.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {sp.error === 'not_configured'
              ? 'Credentials are not set yet — add them in Vercel (see below).'
              : sp.error === 'state_mismatch'
                ? 'Security check failed (state mismatch). Please try connecting again.'
                : `Could not connect: ${sp.error}`}
          </span>
        </div>
      )}

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connection
            {conn ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Connected</Badge>
            ) : configured ? (
              <Badge variant="secondary">Not connected</Badge>
            ) : (
              <Badge variant="outline">Needs credentials</Badge>
            )}
          </CardTitle>
          <CardDescription>Environment: {env}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configured ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Add these environment variables in Vercel (Project → Settings → Environment
                Variables), then redeploy:
              </p>
              <pre className="rounded-md bg-muted p-3 overflow-x-auto text-xs">
{`QUICKBOOKS_CLIENT_ID=<from Intuit app>
QUICKBOOKS_CLIENT_SECRET=<from Intuit app>
QUICKBOOKS_REDIRECT_URI=${REDIRECT_URI}
QUICKBOOKS_ENVIRONMENT=production`}
              </pre>
              <p className="text-muted-foreground">
                In your Intuit app (developer.intuit.com → Keys &amp; OAuth), register this exact
                redirect URI:
              </p>
              <pre className="rounded-md bg-muted p-3 overflow-x-auto text-xs">{REDIRECT_URI}</pre>
            </div>
          ) : conn ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm max-w-md">
                <dt className="text-muted-foreground">Company (realm) id</dt>
                <dd className="font-mono text-xs">{conn.realmId}</dd>
                <dt className="text-muted-foreground">Connected</dt>
                <dd>{conn.connectedAt ? format(new Date(conn.connectedAt), 'MMM d, yyyy h:mm a') : '—'}</dd>
                <dt className="text-muted-foreground">Last sync</dt>
                <dd>{conn.lastSyncAt ? format(new Date(conn.lastSyncAt), 'MMM d, yyyy h:mm a') : 'never'}</dd>
              </dl>
              <QuickBooksControls />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Credentials are set. Connect your QuickBooks company to authorize the sync.
              </p>
              <a href="/api/quickbooks/connect">
                <Button>
                  <Link2 className="h-4 w-4 mr-1.5" /> Connect to QuickBooks
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What will sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> What syncs
          </CardTitle>
          <CardDescription>Built on the connection above; enabled once you&apos;re connected.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <span className="font-medium">Pull ←</span> Profit &amp; Loss and expenses from
            QuickBooks to auto-fill the Profitability tab&apos;s operating costs (overhead, debt,
            salaries) — replacing the manual entries.
          </p>
          <p>
            <span className="font-medium">Push →</span> Weekly payroll wages into QuickBooks as
            journal entries, so the books stay current.
          </p>
          <p className="text-muted-foreground text-xs">
            The OAuth connection, token refresh, and API client are in place now. The pull/push jobs
            turn on next, once the live connection is tested.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
