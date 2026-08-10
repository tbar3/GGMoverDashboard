import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getCrewResponses } from '@/lib/admin-metrics';
import { formatDate } from '@/lib/utils';

type Show = 'all' | 'accepted' | 'declined';

function fmtRespondedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function CrewResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const filter: Show = show === 'accepted' || show === 'declined' ? show : 'all';

  // Pull everything once so the tab counts are accurate, then filter in memory.
  const all = await getCrewResponses('all');
  const accepted = all.filter((r) => r.response === 'accepted');
  const declined = all.filter((r) => r.response === 'declined');
  const rows = filter === 'accepted' ? accepted : filter === 'declined' ? declined : all;

  const tabs: { key: Show; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'accepted', label: 'Accepted', count: accepted.length },
    { key: 'declined', label: 'Declined', count: declined.length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Crew Responses</h1>
        <p className="text-muted-foreground mt-1">
          Who accepted and declined their assigned jobs — declines include the reason given.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Accept / Decline Log</CardTitle>
              <CardDescription>
                {rows.length} {rows.length === 1 ? 'response' : 'responses'}
                {filter !== 'all' && ` · ${filter}`} · most recent first
              </CardDescription>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.key === 'all' ? '/admin/responses' : `/admin/responses?show=${tab.key}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">{tab.count}</span>
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Response</TableHead>
                <TableHead>Crew member</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Job date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Responded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((r) => (
                  <TableRow key={`${r.jobId}-${r.employeeId}`}>
                    <TableCell>
                      {r.response === 'accepted' ? (
                        <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Accepted
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          Declined
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/employees/${r.employeeId}`}
                        className="font-medium hover:underline"
                      >
                        {r.employeeName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/jobs/${r.jobId}`} className="hover:underline">
                        {r.customer || 'Customer'}
                        {r.jobNumber && (
                          <span className="ml-1.5 text-xs text-muted-foreground">#{r.jobNumber}</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(r.jobDate, 'EEE MMM d')}
                      {r.startTime && (
                        <span className="ml-1 text-xs text-muted-foreground">{r.startTime}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {r.reason ? (
                        <span className="text-sm text-muted-foreground">{r.reason}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {fmtRespondedAt(r.respondedAt)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No {filter === 'all' ? '' : `${filter} `}responses yet. Crew accept/decline
                    activity will show up here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
