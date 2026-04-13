'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format, startOfWeek, endOfWeek, addDays, subWeeks } from 'date-fns';
import { DollarSign, Loader2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Employee, PayrollEntry } from '@/types';

interface ExpectedData {
  employee_id: string;
  employee_name: string;
  hourly_rate: number;
  expected_hours: number;
  expected_pay: number;
  job_count: number;
  jobs: { id: string; customer_name: string; job_number: string | null; date: string; estimated_hours: number | null }[];
}

function getMonday(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function getSunday(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 });
}

function getPayDate(weekStart: Date): Date {
  // Pay date is Friday of the following week (trailing 1 week)
  return addDays(weekStart, 11); // Monday + 11 = Friday of next week
}

export default function AdminPayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<Map<string, PayrollEntry>>(new Map());
  const [expectedMap, setExpectedMap] = useState<Map<string, ExpectedData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => {
    // Default to last week (since we pay trailing)
    const lastWeek = subWeeks(new Date(), 1);
    return getMonday(lastWeek);
  });

  const weekEnd = getSunday(weekStart);
  const payDate = getPayDate(weekStart);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const payDateStr = format(payDate, 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [empRes, payRes, expRes] = await Promise.all([
      fetch('/api/employees?active=true'),
      fetch(`/api/payroll?week_start=${weekStartStr}`),
      fetch(`/api/payroll/expected?week_start=${weekStartStr}&week_end=${weekEndStr}`),
    ]);

    if (empRes.ok) setEmployees(await empRes.json());
    if (payRes.ok) {
      const payrollData: PayrollEntry[] = await payRes.json();
      const map = new Map<string, PayrollEntry>();
      for (const entry of payrollData) {
        map.set(entry.employee_id, entry);
      }
      setEntries(map);
    }
    if (expRes.ok) {
      const expData: ExpectedData[] = await expRes.json();
      const map = new Map<string, ExpectedData>();
      for (const exp of expData) {
        map.set(exp.employee_id, exp);
      }
      setExpectedMap(map);
    }
    setLoading(false);
  }, [weekStartStr, weekEndStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function prevWeek() {
    setWeekStart(prev => subWeeks(prev, 1));
  }

  function nextWeek() {
    setWeekStart(prev => addDays(prev, 7));
  }

  async function saveEntry(employeeId: string, data: Partial<PayrollEntry>) {
    setSaving(employeeId);
    const employee = employees.find(e => e.id === employeeId);
    const rate = data.hourly_rate ?? employee?.hourly_rate ?? 0;

    const res = await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: employeeId,
        week_start: weekStartStr,
        week_end: weekEndStr,
        pay_date: payDateStr,
        hourly_rate: rate,
        ...data,
      }),
    });

    if (res.ok) {
      toast.success(`Saved payroll for ${employee?.name}`);
      fetchData();
    } else {
      toast.error('Failed to save');
    }
    setSaving(null);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <p className="text-gray-500 mt-1">Enter weekly payroll data for each employee</p>
      </div>

      {/* Week Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-lg font-semibold">
                {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-500">
                Pay Date: <span className="font-medium">{format(payDate, 'EEEE, MMM d, yyyy')}</span>
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payroll Entry Per Employee */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-4">
          {employees.map((emp) => (
            <EmployeePayrollRow
              key={emp.id}
              employee={emp}
              entry={entries.get(emp.id) || null}
              expected={expectedMap.get(emp.id) || null}
              saving={saving === emp.id}
              onSave={(data) => saveEntry(emp.id, data)}
            />
          ))}
        </div>
      )}

      {/* Summary Table */}
      {!loading && entries.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Week Summary
            </CardTitle>
            <CardDescription>
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right text-blue-600">Exp. Hrs</TableHead>
                  <TableHead className="text-right text-blue-600">Exp. Pay</TableHead>
                  <TableHead className="text-right">Travel</TableHead>
                  <TableHead className="text-right">Job</TableHead>
                  <TableHead className="text-right">Warehouse</TableHead>
                  <TableHead className="text-right">Total Hrs</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Reimb.</TableHead>
                  <TableHead className="text-right">Tips</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(entries.values()).map((entry) => {
                  const totalReimb = Number(entry.lunch_reimbursement) + Number(entry.mileage_reimbursement) + Number(entry.other_reimbursement);
                  const total = Number(entry.gross_pay) + totalReimb + Number(entry.tip);
                  const exp = expectedMap.get(entry.employee_id);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.employee_name}</TableCell>
                      <TableCell className="text-right text-blue-600">{exp ? exp.expected_hours.toFixed(1) : '—'}</TableCell>
                      <TableCell className="text-right text-blue-600">{exp ? `$${exp.expected_pay.toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right">{Number(entry.travel_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{Number(entry.job_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{Number(entry.warehouse_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium">{Number(entry.total_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">${Number(entry.gross_pay).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${totalReimb.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(entry.tip).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${total.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                <TableRow className="bg-gray-50 font-bold">
                  <TableCell>TOTALS</TableCell>
                  <TableCell className="text-right text-blue-600">
                    {Array.from(expectedMap.values()).reduce((s, e) => s + e.expected_hours, 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-blue-600">
                    ${Array.from(expectedMap.values()).reduce((s, e) => s + e.expected_pay, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Array.from(entries.values()).reduce((s, e) => s + Number(e.travel_hours), 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Array.from(entries.values()).reduce((s, e) => s + Number(e.job_hours), 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Array.from(entries.values()).reduce((s, e) => s + Number(e.warehouse_hours), 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Array.from(entries.values()).reduce((s, e) => s + Number(e.total_hours), 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Array.from(entries.values()).reduce((s, e) => s + Number(e.gross_pay), 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Array.from(entries.values()).reduce((s, e) => s + Number(e.lunch_reimbursement) + Number(e.mileage_reimbursement) + Number(e.other_reimbursement), 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Array.from(entries.values()).reduce((s, e) => s + Number(e.tip), 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Array.from(entries.values()).reduce((s, e) => {
                      const reimb = Number(e.lunch_reimbursement) + Number(e.mileage_reimbursement) + Number(e.other_reimbursement);
                      return s + Number(e.gross_pay) + reimb + Number(e.tip);
                    }, 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EmployeePayrollRow({
  employee,
  entry,
  expected,
  saving,
  onSave,
}: {
  employee: Employee;
  entry: PayrollEntry | null;
  expected: ExpectedData | null;
  saving: boolean;
  onSave: (data: Partial<PayrollEntry>) => void;
}) {
  const [travelHours, setTravelHours] = useState(entry?.travel_hours?.toString() || '');
  const [jobHours, setJobHours] = useState(entry?.job_hours?.toString() || '');
  const [warehouseHours, setWarehouseHours] = useState(entry?.warehouse_hours?.toString() || '');
  const [rate, setRate] = useState(entry?.hourly_rate?.toString() || employee.hourly_rate?.toString() || '');
  const [lunch, setLunch] = useState(entry?.lunch_reimbursement?.toString() || '');
  const [mileage, setMileage] = useState(entry?.mileage_reimbursement?.toString() || '');
  const [otherReimb, setOtherReimb] = useState(entry?.other_reimbursement?.toString() || '');
  const [tip, setTip] = useState(entry?.tip?.toString() || '');
  const [notes, setNotes] = useState(entry?.notes || '');

  // Update fields when entry changes (week navigation)
  useEffect(() => {
    setTravelHours(entry?.travel_hours?.toString() || '');
    setJobHours(entry?.job_hours?.toString() || '');
    setWarehouseHours(entry?.warehouse_hours?.toString() || '');
    setRate(entry?.hourly_rate?.toString() || employee.hourly_rate?.toString() || '');
    setLunch(entry?.lunch_reimbursement?.toString() || '');
    setMileage(entry?.mileage_reimbursement?.toString() || '');
    setOtherReimb(entry?.other_reimbursement?.toString() || '');
    setTip(entry?.tip?.toString() || '');
    setNotes(entry?.notes || '');
  }, [entry, employee.hourly_rate]);

  const totalHours = (parseFloat(travelHours) || 0) + (parseFloat(jobHours) || 0) + (parseFloat(warehouseHours) || 0);
  const grossPay = totalHours * (parseFloat(rate) || 0);
  const totalReimb = (parseFloat(lunch) || 0) + (parseFloat(mileage) || 0) + (parseFloat(otherReimb) || 0);
  const total = grossPay + totalReimb + (parseFloat(tip) || 0);

  function handleSave() {
    onSave({
      travel_hours: parseFloat(travelHours) || 0,
      job_hours: parseFloat(jobHours) || 0,
      warehouse_hours: parseFloat(warehouseHours) || 0,
      hourly_rate: parseFloat(rate) || 0,
      lunch_reimbursement: parseFloat(lunch) || 0,
      mileage_reimbursement: parseFloat(mileage) || 0,
      other_reimbursement: parseFloat(otherReimb) || 0,
      tip: parseFloat(tip) || 0,
      notes: notes || null,
    } as Partial<PayrollEntry>);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{employee.name}</CardTitle>
            <Badge variant="outline" className="capitalize">{employee.role}</Badge>
            {entry && <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Saved</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900">${total.toFixed(2)}</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Expected from jobs */}
        {expected && expected.job_count > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-blue-50 flex items-center gap-4 text-sm">
            <span className="text-blue-700 font-medium">Expected:</span>
            <span className="text-blue-600">{expected.job_count} job{expected.job_count !== 1 ? 's' : ''}</span>
            <span className="text-blue-600">{expected.expected_hours.toFixed(1)} hrs</span>
            <span className="text-blue-600 font-medium">${expected.expected_pay.toFixed(2)}</span>
            <span className="text-blue-400 text-xs">
              ({expected.jobs.map(j => j.job_number || j.customer_name).join(', ')})
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Rate/hr</Label>
            <Input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Travel Hrs</Label>
            <Input type="number" step="0.25" value={travelHours} onChange={e => setTravelHours(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Job Hrs</Label>
            <Input type="number" step="0.25" value={jobHours} onChange={e => setJobHours(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Warehouse Hrs</Label>
            <Input type="number" step="0.25" value={warehouseHours} onChange={e => setWarehouseHours(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lunch $</Label>
            <Input type="number" step="0.01" value={lunch} onChange={e => setLunch(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mileage $</Label>
            <Input type="number" step="0.01" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Other $</Label>
            <Input type="number" step="0.01" value={otherReimb} onChange={e => setOtherReimb(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tip $</Label>
            <Input type="number" step="0.01" value={tip} onChange={e => setTip(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total Hrs</Label>
            <div className="h-9 flex items-center px-3 rounded-md border bg-gray-50 text-sm font-medium">
              {totalHours.toFixed(1)}
            </div>
          </div>
        </div>
        {/* Gross pay summary */}
        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
          <span>Gross: <span className="font-medium text-gray-700">${grossPay.toFixed(2)}</span></span>
          {totalReimb > 0 && <span>Reimb: <span className="font-medium text-gray-700">${totalReimb.toFixed(2)}</span></span>}
          {(parseFloat(tip) || 0) > 0 && <span>Tip: <span className="font-medium text-gray-700">${(parseFloat(tip) || 0).toFixed(2)}</span></span>}
        </div>
      </CardContent>
    </Card>
  );
}
