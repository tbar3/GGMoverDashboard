'use client';

import { useEffect, useState } from 'react';
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
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Plus, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Damage, Employee, Job, CONFIG } from '@/types';
import { formatDate } from '@/lib/utils';

function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function emptyForm() {
  return {
    job_id: '',
    employee_ids: [] as string[],
    description: '',
    amount: '',
    was_reported: true,
    job_date: '',        // auto-filled from the selected job, still editable
    effective_date: today(), // most damages are booked the day they're logged
  };
}

export default function DamagesPage() {
  const [damages, setDamages] = useState<Damage[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Damage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Damage | null>(null);
  const [saving, setSaving] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [damagesRes, employeesRes, jobsRes] = await Promise.all([
      fetch('/api/damages'),
      fetch('/api/employees?active=true'),
      fetch('/api/jobs'), // all jobs, so any past move can be attributed
    ]);

    if (damagesRes.ok) setDamages(await damagesRes.json());
    if (employeesRes.ok) setEmployees(await employeesRes.json());
    if (jobsRes.ok) setJobs(await jobsRes.json());
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setFormData(emptyForm());
    setJobSearch('');
    setDialogOpen(true);
  }

  function openEdit(damage: Damage) {
    setEditing(damage);
    setFormData({
      job_id: damage.job_id ?? '',
      employee_ids: [...damage.employee_ids],
      description: damage.description,
      amount: String(Number(damage.amount)),
      was_reported: damage.was_reported,
      job_date: damage.job_date?.slice(0, 10) ?? '',
      effective_date: damage.effective_date.slice(0, 10),
    });
    setJobSearch('');
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      job_id: formData.job_id || null,
      employee_ids: formData.employee_ids,
      description: formData.description,
      amount: parseFloat(formData.amount),
      was_reported: formData.was_reported,
      job_date: formData.job_date || null,
      effective_date: formData.effective_date || today(),
    };

    setSaving(true);
    const res = await fetch(editing ? `/api/damages/${editing.id}` : '/api/damages', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to ${editing ? 'update' : 'log'} damage`);
      return;
    }

    toast.success(editing ? 'Damage updated' : 'Damage logged successfully');
    setDialogOpen(false);
    setEditing(null);
    setFormData(emptyForm());
    fetchData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setSaving(true);
    const res = await fetch(`/api/damages/${deleteTarget.id}`, { method: 'DELETE' });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed to delete damage');
      return;
    }

    toast.success('Damage deleted');
    setDeleteTarget(null);
    fetchData();
  }

  /** A job's date as the yyyy-MM-dd a <input type="date"> wants. */
  function jobDateInputValue(jobId: string): string {
    return (jobId && jobById.get(jobId)?.date?.slice(0, 10)) || '';
  }

  // Picking a job pre-fills the job date from that job. The field stays editable,
  // and a value the user typed themselves survives switching jobs.
  function selectJob(jobId: string) {
    setFormData((prev) => {
      const edited = prev.job_date !== '' && prev.job_date !== jobDateInputValue(prev.job_id);
      return {
        ...prev,
        job_id: jobId,
        job_date: edited ? prev.job_date : jobDateInputValue(jobId),
      };
    });
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
    return damage.was_reported ? Number(damage.amount) : Number(damage.amount) * CONFIG.UNREPORTED_DAMAGE_MULTIPLIER;
  }

  const totalPoolImpact = damages.reduce((sum, d) => sum + getPoolImpact(d), 0);

  const jobById = new Map(jobs.map((j) => [j.id, j]));
  /** Job cell text — the date lives in its own column now, so don't repeat it. */
  function jobCustomerLabel(job: Job): string {
    return `${job.customer_name ?? 'Customer'}${job.job_number ? ` · #${job.job_number}` : ''}`;
  }
  /** Dropdown text — here the date is what makes two same-customer jobs tellable apart. */
  function jobLabel(job: Job): string {
    return `${formatDate(job.date, 'MMM d, yyyy')} · ${job.customer_name ?? 'Customer'}${
      job.job_number ? ` · #${job.job_number}` : ''
    }`;
  }
  const q = jobSearch.trim().toLowerCase();
  const filteredJobs = q
    ? jobs.filter(
        (j) =>
          jobLabel(j).toLowerCase().includes(q) ||
          (j.pickup_address ?? '').toLowerCase().includes(q)
      )
    : jobs;

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Damages</h1>
          <p className="text-muted-foreground mt-1">
            Track damages that affect the bonus pool. Unreported damages cost {CONFIG.UNREPORTED_DAMAGE_MULTIPLIER}x.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Log Damage
        </Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Damage' : 'Log Damage'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Changing the amount, the 2x flag or the effective date moves money in any payout period that has not been paid yet.'
                  : 'Record a damage incident. Remember: unreported damages cost 2x from the bonus pool.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="job">Related Job (optional)</Label>
                <Input
                  placeholder="Search by customer, date, job #, or address…"
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                />
                <select
                  id="job"
                  value={formData.job_id}
                  onChange={(e) => selectJob(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  size={Math.min(8, Math.max(3, filteredJobs.length + 1))}
                >
                  <option value="">Select job…</option>
                  {/* Keep the chosen job visible even if the current search would hide it. */}
                  {formData.job_id &&
                    !filteredJobs.some((j) => j.id === formData.job_id) &&
                    jobById.get(formData.job_id) && (
                      <option value={formData.job_id}>
                        {jobLabel(jobById.get(formData.job_id)!)}
                      </option>
                    )}
                  {filteredJobs.slice(0, 300).map((job) => (
                    <option key={job.id} value={job.id}>
                      {jobLabel(job)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {filteredJobs.length} of {jobs.length} jobs
                  {filteredJobs.length > 300 ? ' · showing first 300, refine your search' : ''}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_date">Job Date</Label>
                  <Input
                    id="job_date"
                    type="date"
                    value={formData.job_date}
                    onChange={(e) => setFormData({ ...formData, job_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    When the move happened. Fills in from the job; leave blank for
                    warehouse or shop damage.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="effective_date">Effective Date</Label>
                  <Input
                    id="effective_date"
                    type="date"
                    value={formData.effective_date}
                    onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    When it actually comes out of the pool. This decides which
                    payout period it hits.
                  </p>
                </div>
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

              <div className="flex items-center space-x-2 p-4 bg-destructive/10 rounded-lg">
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
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Pool impact will be ${(parseFloat(formData.amount) * CONFIG.UNREPORTED_DAMAGE_MULTIPLIER).toFixed(2)} (2x penalty for unreported)
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Log Damage'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-red-50 border-red-200">
        <CardHeader className="pb-2">
          <CardDescription className="text-destructive">Total Pool Impact</CardDescription>
          <CardTitle className="text-3xl text-destructive">
            ${totalPoolImpact.toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">This amount will be deducted from the bonus pool</p>
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
                <TableHead>Job Date</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Pool Impact</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {damages.length > 0 ? (
                damages.map((damage) => (
                  <TableRow key={damage.id}>
                    <TableCell className="whitespace-nowrap">
                      {damage.job_date
                        ? formatDate(damage.job_date, 'MMM d, yyyy')
                        : <span className="text-muted-foreground/70">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(damage.effective_date, 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {damage.job_id && jobById.get(damage.job_id)
                        ? jobCustomerLabel(jobById.get(damage.job_id)!)
                        : <span className="text-muted-foreground/70">—</span>}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {damage.description}
                    </TableCell>
                    <TableCell>${Number(damage.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={damage.was_reported ? 'default' : 'destructive'}>
                        {damage.was_reported ? 'Yes' : 'No (2x)'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-destructive font-medium">
                      -${getPoolImpact(damage).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {damage.employee_ids.length > 0
                        ? getEmployeeNames(damage.employee_ids)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(damage)}
                          aria-label={`Edit damage: ${damage.description}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(damage)}
                          aria-label={`Delete damage: ${damage.description}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No damages recorded. Great job protecting customer property!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this damage?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  {formatDate(deleteTarget.effective_date, 'MMM d, yyyy')} &middot;{' '}
                  ${Number(deleteTarget.amount).toFixed(2)}
                  {!deleteTarget.was_reported && ' (2x unreported)'} &middot;{' '}
                  {deleteTarget.description}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget && (
              <>
                This puts ${getPoolImpact(deleteTarget).toFixed(2)} back into the payout period
                covering {formatDate(deleteTarget.effective_date, 'MMM d, yyyy')}, if that period
                has not been paid yet. It cannot be undone.
              </>
            )}
          </p>
          <div className="flex gap-4 pt-4">
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete Damage'}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
