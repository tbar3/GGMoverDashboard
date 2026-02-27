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
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Damage, Employee, Job, CONFIG } from '@/types';

export default function DamagesPage() {
  const [damages, setDamages] = useState<Damage[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    job_id: '',
    employee_ids: [] as string[],
    description: '',
    amount: '',
    was_reported: true,
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [damagesRes, employeesRes, jobsRes] = await Promise.all([
      supabase.from('damages').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('jobs').select('*').order('date', { ascending: false }).limit(50),
    ]);

    if (damagesRes.data) setDamages(damagesRes.data);
    if (employeesRes.data) setEmployees(employeesRes.data);
    if (jobsRes.data) setJobs(jobsRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.from('damages').insert({
      job_id: formData.job_id || null,
      employee_ids: formData.employee_ids,
      description: formData.description,
      amount: parseFloat(formData.amount),
      was_reported: formData.was_reported,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Damage logged successfully');
    setDialogOpen(false);
    setFormData({
      job_id: '',
      employee_ids: [],
      description: '',
      amount: '',
      was_reported: true,
    });
    fetchData();
  }

  function toggleEmployee(employeeId: string) {
    setFormData(prev => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(employeeId)
        ? prev.employee_ids.filter(id => id !== employeeId)
        : [...prev.employee_ids, employeeId],
    }));
  }

  function getEmployeeNames(employeeIds: string[]) {
    return employeeIds
      .map(id => employees.find(e => e.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  function getPoolImpact(damage: Damage): number {
    return damage.was_reported ? damage.amount : damage.amount * CONFIG.UNREPORTED_DAMAGE_MULTIPLIER;
  }

  const totalPoolImpact = damages.reduce((sum, d) => sum + getPoolImpact(d), 0);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Damages</h1>
          <p className="text-gray-500 mt-1">
            Track damages that affect the bonus pool. Unreported damages cost {CONFIG.UNREPORTED_DAMAGE_MULTIPLIER}x.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Damage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Log Damage</DialogTitle>
              <DialogDescription>
                Record a damage incident. Remember: unreported damages cost 2x from the bonus pool.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job">Related Job (optional)</Label>
                  <select
                    id="job"
                    value={formData.job_id}
                    onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select job...</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {format(new Date(job.date), 'MMM d')} - {job.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Damage Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the damage..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Employees Involved</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border rounded-lg p-4">
                  {employees.map((employee) => (
                    <div key={employee.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`emp-${employee.id}`}
                        checked={formData.employee_ids.includes(employee.id)}
                        onCheckedChange={() => toggleEmployee(employee.id)}
                      />
                      <Label htmlFor={`emp-${employee.id}`} className="font-normal text-sm">
                        {employee.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2 p-4 bg-yellow-50 rounded-lg">
                <Checkbox
                  id="reported"
                  checked={formData.was_reported}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, was_reported: checked as boolean })
                  }
                />
                <Label htmlFor="reported" className="font-normal">
                  Damage was properly reported to customer and management
                </Label>
              </div>

              {!formData.was_reported && formData.amount && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Pool impact will be ${(parseFloat(formData.amount) * CONFIG.UNREPORTED_DAMAGE_MULTIPLIER).toFixed(2)} (2x penalty for unreported)
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button type="submit">Log Damage</Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Card */}
      <Card className="bg-red-50 border-red-200">
        <CardHeader className="pb-2">
          <CardDescription className="text-red-600">Total Pool Impact</CardDescription>
          <CardTitle className="text-3xl text-red-600">
            ${totalPoolImpact.toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">
            This amount will be deducted from the bonus pool
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Damage Log</CardTitle>
          <CardDescription>{damages.length} damages recorded</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Pool Impact</TableHead>
                <TableHead>Employees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {damages.length > 0 ? (
                damages.map((damage) => (
                  <TableRow key={damage.id}>
                    <TableCell>
                      {format(new Date(damage.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {damage.description}
                    </TableCell>
                    <TableCell>${damage.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={damage.was_reported ? 'default' : 'destructive'}>
                        {damage.was_reported ? 'Yes' : 'No (2x)'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-red-600 font-medium">
                      -${getPoolImpact(damage).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {damage.employee_ids.length > 0
                        ? getEmployeeNames(damage.employee_ids)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No damages recorded. Great job protecting customer property!
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
