'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Employee, Attendance, CONFIG } from '@/types';
import { Save, Download } from 'lucide-react';

const DEFAULT_START = `${CONFIG.TARDY_CUTOFF_HOUR.toString().padStart(2, '0')}:${CONFIG.TARDY_CUTOFF_MINUTE.toString().padStart(2, '0')}`;

// Local calendar date as YYYY-MM-DD. Using toISOString() here would return the
// UTC day, which flips to "tomorrow" on ET evenings and made the board header
// disagree with the date picker.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

export default function AttendancePage() {
  const [exportStart, setExportStart] = useState(daysAgo(13));
  const [exportEnd, setExportEnd] = useState(daysAgo(0));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [selectedDate, setSelectedDate] = useState(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);
    const [employeesRes, attendanceRes] = await Promise.all([
      fetch('/api/employees?active=true'),
      fetch(`/api/attendance?date=${selectedDate}`),
    ]);

    if (employeesRes.ok) setEmployees(await employeesRes.json());

    if (attendanceRes.ok) {
      const data: Attendance[] = await attendanceRes.json();
      const record: Record<string, Attendance> = {};
      data.forEach(a => { record[a.employee_id] = a; });
      setAttendance(record);
    }

    setLoading(false);
  }

  function updateAttendance(employeeId: string, field: keyof Attendance, value: string | boolean) {
    setAttendance(prev => {
      const existing = prev[employeeId];
      const next = {
        ...existing,
        employee_id: employeeId,
        date: selectedDate,
        scheduled_start: existing?.scheduled_start || DEFAULT_START,
        [field]: value,
      } as Attendance;
      // Recompute lateness whenever arrival or scheduled start changes.
      const late = minutesLate(next.scheduled_start, next.arrival_time);
      next.late_minutes = late;
      next.is_tardy = late > 0;
      return { ...prev, [employeeId]: next };
    });
  }

  function minutesLate(scheduledStart: string, arrival: string | null): number {
    if (!arrival) return 0;
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    return Math.max(0, toMin(arrival) - toMin(scheduledStart || DEFAULT_START));
  }

  async function saveAttendance() {
    setSaving(true);

    const records = Object.values(attendance).filter(a => a.arrival_time);

    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records.map(r => ({
        employee_id: r.employee_id,
        date: selectedDate,
        arrival_time: r.arrival_time,
        scheduled_start: r.scheduled_start || DEFAULT_START,
        late_minutes: r.late_minutes ?? 0,
        is_tardy: r.is_tardy,
        in_uniform: r.in_uniform ?? true,
        notes: r.notes,
      }))),
    });

    if (!res.ok) {
      toast.error('Error saving attendance');
      setSaving(false);
      return;
    }

    toast.success('Attendance saved successfully');
    setSaving(false);
    fetchData();
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const cutoffTime = `${CONFIG.TARDY_CUTOFF_HOUR.toString().padStart(2, '0')}:${CONFIG.TARDY_CUTOFF_MINUTE.toString().padStart(2, '0')}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
          <p className="text-muted-foreground mt-1">
            Log daily attendance. Tardy cutoff: {cutoffTime} AM
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
          <Button onClick={saveAttendance} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Attendance'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export time & events</CardTitle>
          <CardDescription>
            Download a CSV of late time (unpaid minutes) plus every positive, GG Point, strike, and
            write-up across a date range — for payroll and records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">From</label>
              <Input
                type="date"
                value={exportStart}
                onChange={(e) => setExportStart(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">To</label>
              <Input
                type="date"
                value={exportEnd}
                onChange={(e) => setExportEnd(e.target.value)}
                className="w-auto"
              />
            </div>
            <a
              href={`/api/events/export?start=${exportStart}&end=${exportEnd}`}
              download
            >
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Attendance for {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
          </CardTitle>
          <CardDescription>
            Enter arrival times and check uniform compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Late (unpaid)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In Uniform</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => {
                const record = attendance[employee.id];
                return (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {employee.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={record?.scheduled_start || DEFAULT_START}
                        onChange={(e) => updateAttendance(employee.id, 'scheduled_start', e.target.value)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={record?.arrival_time || ''}
                        onChange={(e) => updateAttendance(employee.id, 'arrival_time', e.target.value)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      {record?.arrival_time && (record?.late_minutes ?? 0) > 0 ? (
                        <span className="text-destructive font-medium">
                          {record.late_minutes} min
                          <span className="text-muted-foreground font-normal">
                            {' '}(−{(record.late_minutes / 60).toFixed(2)} hr)
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record?.arrival_time ? (
                        <Badge variant={record.is_tardy ? 'destructive' : 'default'}>
                          {record.is_tardy ? 'Late' : 'On Time'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/70">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={record?.in_uniform ?? true}
                        onCheckedChange={(checked) =>
                          updateAttendance(employee.id, 'in_uniform', checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={record?.notes || ''}
                        onChange={(e) => updateAttendance(employee.id, 'notes', e.target.value)}
                        placeholder="Optional notes"
                        className="w-48"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
