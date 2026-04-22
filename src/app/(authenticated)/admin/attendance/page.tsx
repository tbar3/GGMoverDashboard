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
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Employee, Attendance, CONFIG } from '@/types';
import { Save } from 'lucide-react';

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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
    setAttendance(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        employee_id: employeeId,
        date: selectedDate,
        [field]: value,
        ...(field === 'arrival_time' && typeof value === 'string' ? {
          is_tardy: checkTardy(value),
        } : {}),
      } as Attendance,
    }));
  }

  function checkTardy(timeString: string): boolean {
    if (!timeString) return false;
    const [hours, minutes] = timeString.split(':').map(Number);
    const cutoffMinutes = CONFIG.TARDY_CUTOFF_HOUR * 60 + CONFIG.TARDY_CUTOFF_MINUTE;
    const arrivalMinutes = hours * 60 + minutes;
    return arrivalMinutes > cutoffMinutes;
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
          <CardTitle>
            Attendance for {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
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
                <TableHead>Arrival Time</TableHead>
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
                        value={record?.arrival_time || ''}
                        onChange={(e) => updateAttendance(employee.id, 'arrival_time', e.target.value)}
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      {record?.arrival_time ? (
                        <Badge variant={record.is_tardy ? 'destructive' : 'default'}>
                          {record.is_tardy ? 'Tardy' : 'On Time'}
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
