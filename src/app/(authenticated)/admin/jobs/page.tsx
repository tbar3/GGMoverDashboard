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
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Job, Employee } from '@/types';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customer_name: '',
    pickup_address: '',
    dropoff_address: '',
    revenue: '',
    crew_ids: [] as string[],
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [jobsRes, employeesRes] = await Promise.all([
      supabase.from('jobs').select('*').order('date', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
    ]);

    if (jobsRes.data) setJobs(jobsRes.data);
    if (employeesRes.data) setEmployees(employeesRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.from('jobs').insert({
      date: formData.date,
      customer_name: formData.customer_name,
      pickup_address: formData.pickup_address,
      dropoff_address: formData.dropoff_address,
      revenue: formData.revenue ? parseFloat(formData.revenue) : null,
      crew_ids: formData.crew_ids,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Job created successfully');
    setDialogOpen(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      customer_name: '',
      pickup_address: '',
      dropoff_address: '',
      revenue: '',
      crew_ids: [],
    });
    fetchData();
  }

  function toggleCrewMember(employeeId: string) {
    setFormData(prev => ({
      ...prev,
      crew_ids: prev.crew_ids.includes(employeeId)
        ? prev.crew_ids.filter(id => id !== employeeId)
        : [...prev.crew_ids, employeeId],
    }));
  }

  function getCrewNames(crewIds: string[]) {
    return crewIds
      .map(id => employees.find(e => e.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">Manage moving jobs and crew assignments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
              <DialogDescription>
                Add a new moving job with crew assignments
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <Label htmlFor="customer">Customer Name</Label>
                  <Input
                    id="customer"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Mr./Mrs. Smith"
                    required
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="pickup">Pickup Address</Label>
                  <Input
                    id="pickup"
                    value={formData.pickup_address}
                    onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                    placeholder="123 Main St, Atlanta, GA"
                    required
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="dropoff">Dropoff Address</Label>
                  <Input
                    id="dropoff"
                    value={formData.dropoff_address}
                    onChange={(e) => setFormData({ ...formData, dropoff_address: e.target.value })}
                    placeholder="456 Oak Ave, Atlanta, GA"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revenue">Revenue (optional)</Label>
                  <Input
                    id="revenue"
                    type="number"
                    step="0.01"
                    value={formData.revenue}
                    onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign Crew</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border rounded-lg p-4">
                  {employees.map((employee) => (
                    <div key={employee.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`crew-${employee.id}`}
                        checked={formData.crew_ids.includes(employee.id)}
                        onCheckedChange={() => toggleCrewMember(employee.id)}
                      />
                      <Label htmlFor={`crew-${employee.id}`} className="font-normal text-sm">
                        {employee.name}
                        <Badge variant="outline" className="ml-2 capitalize text-xs">
                          {employee.role}
                        </Badge>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit">Create Job</Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Jobs</CardTitle>
          <CardDescription>{jobs.length} jobs total</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Crew</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length > 0 ? (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{format(new Date(job.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="font-medium">{job.customer_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{job.pickup_address}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{job.dropoff_address}</TableCell>
                    <TableCell>
                      {job.crew_ids.length > 0 ? (
                        <span className="text-sm">{getCrewNames(job.crew_ids)}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">No crew assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.revenue ? `$${job.revenue.toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No jobs found. Add your first job to get started.
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
