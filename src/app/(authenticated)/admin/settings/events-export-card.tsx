'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download } from 'lucide-react';

// Monday–Sunday of the pay period containing `d` (weeks start Monday here).
function payPeriod(d = new Date()): { start: string; end: string } {
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

export function EventsExportCard() {
  const initial = payPeriod();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);

  function setThisPeriod() {
    const p = payPeriod();
    setStart(p.start);
    setEnd(p.end);
  }
  function setLastPeriod() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const p = payPeriod(d);
    setStart(p.start);
    setEnd(p.end);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll events export</CardTitle>
        <CardDescription>
          Download a CSV of everything that affects pay for a period — late time (unpaid minutes)
          plus every positive, GG Point, strike, and write-up. Filtered by <strong>effective date</strong>{' '}
          (the day it was logged), which is the pay period it&apos;s paid in. Defaults to this week&apos;s
          pay period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">From (effective)</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-auto" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">To (effective)</label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-auto" />
          </div>
          <Button variant="outline" size="sm" onClick={setThisPeriod}>
            This pay period
          </Button>
          <Button variant="outline" size="sm" onClick={setLastPeriod}>
            Last pay period
          </Button>
          <a href={`/api/events/export?start=${start}&end=${end}`} download>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
