'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, Car, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { MileageEntry, Employee, Job, CONFIG } from '@/types';

export default function MileagePage() {
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    job_id: '',
    date: new Date().toISOString().split('T')[0],
    miles: '',
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [entriesRes, employeesRes, jobsRes] = await Promise.all([
      supabase.from('mileage_entries').select('*').order('date', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('jobs').select('*').order('date', { ascending: false }).limit(50),
    ]);

    if (entriesRes.data) setEntries(entriesRes.data);
    if (employeesRes.data) setEmployees(employeesRes.data);
    if (jobsRes.data) setJobs(jobsRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const miles = parseFloat(formData.miles);
    const amount = miles * CONFIG.MILEAGE_RATE;

    const { error } = await supabase.from('mileage_entries').insert({
      employee_id: formData.employee_id,
      job_id: formData.job_id || null,
      date: formData.date,
      miles,
      amount,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Mileage entry added');
    setDialogOpen(false);
    setFormData({
      employee_id: '',
      job_id: '',
      date: new Date().toISOString().split('T')[0],
      miles: '',
    });
    fetchData();
  }

  function getEmployeeName(employeeId: string) {
    return employees.find(e => e.id === employeeId)?.name || 'Unknown';
  }

  // Calculate totals by employee for current month
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const currentMonthEntries = entries.filter(e => {
    const date = new Date(e.date);
    return date >= monthStart && date <= monthEnd;
  });

  const employeeTotals = employees.map(emp => {
    const empEntries = currentMonthEntries.filter(e => e.employee_id === emp.id);
    return {
      ...emp,
      totalMiles: empEntries.reduce((sum, e) => sum + e.miles, 0),
      totalAmount: empEntries.reduce((sum, e) => sum + e.amount, 0),
    };
  }).filter(e => e.totalMiles > 0).sort((a, b) => b.totalAmount - a.totalAmount);

  const totalMileageOwed = currentMonthEntries.reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mileage</h1>
          <p className="text-gray-500 mt-1">
            Track personal vehicle mileage at ${CONFIG.MILEAGE_RATE}/mile
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Mileage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Mileage</DialogTitle>
              <DialogDescription>
                Record roundtrip mileage from the warehouse at ${CONFIG.MILEAGE_RATE}/mile
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <div className="flex items-center gap-2 text-blue-700">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">Warehouse:</span>
                </div>
                <p className="text-blue-600 mt-1">{CONFIG.WAREHOUSE_ADDRESS}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee">Employee</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job">Related Job (optional)</Label>
                <Select
                  value={formData.job_id}
                  onValueChange={(v) => setFormData({ ...formData, job_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No job</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {format(new Date(job.date), 'MMM d')} - {job.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="miles">Roundtrip Miles</Label>
                  <Input
                    id="miles"
                    type="number"
                    step="0.1"
                    value={formData.miles}
                    onChange={(e) => setFormData({ ...formData, miles: e.target.value })}
                    placeholder="0.0"
                    required
                  />
                </div>
              </div>

              {formData.miles && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-green-700 font-medium">
                    Amount: ${(parseFloat(formData.miles) * CONFIG.MILEAGE_RATE).toFixed(2)}
                  </p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={!formData.employee_id || !formData.miles}>
                  Add Mileage
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardHeader>
            <CardDescription className="text-blue-100">
              {format(now, 'MMMM yyyy')} Total
            </CardDescription>
            <CardTitle className="text-3xl text-white">
              ${totalMileageOwed.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-blue-100">
              {currentMonthEntries.reduce((sum, e) => sum + e.miles, 0).toFixed(1)} miles total
            </p>
          </CardContent>
        </Card>

        {/* Employee Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              {format(now, 'MMMM')} Breakdown by Employee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employeeTotals.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{emp.name}</p>
                    <p className="text-sm text-gray-500">{emp.totalMiles.toFixed(1)} miles</p>
                  </div>
                  <Badge variant="secondary" className="text-lg">
                    ${emp.totalAmount.toFixed(2)}
                  </Badge>
                </div>
              ))}
              {employeeTotals.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No mileage recorded this month
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Entries */}
      <Card>
        <CardHeader>
          <CardTitle>All Mileage Entries</CardTitle>
          <CardDescription>{entries.length} entries total</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Miles</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Job</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length > 0 ? (
                entries.slice(0, 50).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(new Date(entry.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {getEmployeeName(entry.employee_id)}
                    </TableCell>
                    <TableCell>{entry.miles.toFixed(1)} mi</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      ${entry.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {entry.job_id
                        ? jobs.find(j => j.id === entry.job_id)?.customer_name || 'Unknown'
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No mileage entries yet
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
