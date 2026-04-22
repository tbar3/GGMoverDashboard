'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarSync, Check, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Job } from '@/types';
import { format } from 'date-fns';

export default function CalendarSyncPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [calendarFound, setCalendarFound] = useState<boolean | null>(null);
  const [calendarName, setCalendarName] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [lastSyncResult, setLastSyncResult] = useState<{
    total_events: number;
    synced: number;
    skipped: number;
    errors: string[];
    unmatched_crew: string[];
  } | null>(null);

  useEffect(() => {
    checkStatus();
    fetchJobs();

    // Check URL for connected=true
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      toast.success('Google Calendar connected successfully!');
      window.history.replaceState({}, '', '/admin/calendar');
    }
  }, []);

  async function checkStatus() {
    const res = await fetch('/api/calendar/status');
    if (res.ok) {
      const data = await res.json();
      setConnected(data.connected);
      setCalendarFound(data.calendarFound ?? null);
      setCalendarName(data.calendarName ?? null);
    }
  }

  async function fetchJobs() {
    const res = await fetch('/api/jobs?limit=50');
    if (res.ok) {
      const data = await res.json();
      setJobs(data.filter((j: Job) => j.calendar_event_id));
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    setLastSyncResult(null);

    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Sync failed');
        return;
      }

      setLastSyncResult(data);
      toast.success(`Synced ${data.synced} jobs from Google Calendar`);
      fetchJobs();
    } catch {
      toast.error('Failed to sync calendar');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendar Sync</h1>
        <p className="text-muted-foreground mt-1">
          Import jobs from Google Calendar (SmartMoving)
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarSync className="h-5 w-5" />
            Google Calendar Connection
          </CardTitle>
          <CardDescription>
            Connect your Google Calendar to import SmartMoving job data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected === null ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking connection...
            </div>
          ) : connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <Check className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
                {calendarFound ? (
                  <span className="text-sm text-muted-foreground">
                    Syncing from: <span className="font-medium text-foreground">{calendarName}</span>
                  </span>
                ) : (
                  <span className="text-sm text-destructive">
                    &quot;SmartMoving Jobs&quot; calendar not found. Make sure it exists in your Google Calendar.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click below to authorize access to your Google Calendar. This allows the dashboard
                to read your SmartMoving job events.
              </p>
              <a href="/api/auth/google">
                <Button>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Google Calendar
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Controls */}
      {connected && calendarFound && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Jobs</CardTitle>
            <CardDescription>
              Select a date range to import jobs from your calendar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button onClick={handleSync} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            {lastSyncResult && (
              <div className="rounded-lg border p-4 bg-muted space-y-1">
                <p className="text-sm font-medium">Sync Results</p>
                <p className="text-sm text-muted-foreground">
                  Found {lastSyncResult.total_events} calendar events &middot;
                  Synced {lastSyncResult.synced} jobs &middot;
                  Skipped {lastSyncResult.skipped} non-job events
                </p>
                {lastSyncResult.unmatched_crew.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-destructive font-medium">
                      Unmatched crew (not in dashboard — add them under Employees):
                    </p>
                    <p className="text-sm text-destructive">
                      {lastSyncResult.unmatched_crew.join(', ')}
                    </p>
                  </div>
                )}
                {lastSyncResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-destructive font-medium">Errors:</p>
                    {lastSyncResult.errors.map((err, i) => (
                      <p key={i} className="text-sm text-destructive">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Synced Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Synced Jobs</CardTitle>
          <CardDescription>
            Jobs imported from Google Calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Crew</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant="outline">{job.job_number || '-'}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(job.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{job.customer_name}</p>
                          {job.customer_phone && (
                            <p className="text-xs text-muted-foreground">{job.customer_phone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{job.service_type || '-'}</p>
                          {job.estimated_hours && (
                            <p className="text-xs text-muted-foreground">{job.estimated_hours} hrs est.</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {job.crew_manifest && job.crew_manifest.length > 0 ? (
                          <div className="space-y-0.5">
                            {job.crew_manifest.map((member, i) => (
                              <p key={i} className="text-xs">
                                {member.name}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70 text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.truck_name ? (
                          <Badge variant="secondary">{job.truck_name}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {job.revenue ? `$${Number(job.revenue).toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No synced jobs yet. Connect your calendar and sync to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
