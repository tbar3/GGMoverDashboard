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
import { format } from 'date-fns';
import { Plus, Star, Award, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PerformanceEvent, PerformanceEventType, Employee } from '@/types';

export default function PerformancePage() {
  const [events, setEvents] = useState<PerformanceEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    type: 'five_star_review' as PerformanceEventType,
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [eventsRes, employeesRes] = await Promise.all([
      supabase.from('performance_events').select('*').order('date', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
    ]);

    if (eventsRes.data) setEvents(eventsRes.data);
    if (employeesRes.data) setEmployees(employeesRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.from('performance_events').insert({
      employee_id: formData.employee_id,
      type: formData.type,
      description: formData.description || null,
      date: formData.date,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Performance event logged');
    setDialogOpen(false);
    setFormData({
      employee_id: '',
      type: 'five_star_review',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    fetchData();
  }

  function getEmployeeName(employeeId: string) {
    return employees.find(e => e.id === employeeId)?.name || 'Unknown';
  }

  function getTypeInfo(type: PerformanceEventType) {
    switch (type) {
      case 'five_star_review':
        return { label: '5-Star Review', icon: <Star className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-800' };
      case 'customer_callout':
        return { label: 'Customer Call-Out', icon: <Award className="h-4 w-4" />, color: 'bg-green-100 text-green-800' };
      case 'crew_callout':
        return { label: 'Crew Call-Out', icon: <Users className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800' };
    }
  }

  // Calculate leaderboard
  const leaderboard = employees
    .map(emp => ({
      ...emp,
      score: events.filter(e => e.employee_id === emp.id).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
          <p className="text-gray-500 mt-1">
            Track 5-star reviews, customer call-outs, and crew recognition
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Recognition
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Performance Event</DialogTitle>
              <DialogDescription>
                Record a review, customer call-out, or crew recognition
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as PerformanceEventType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="five_star_review">5-Star Review</SelectItem>
                    <SelectItem value="customer_callout">Customer Call-Out</SelectItem>
                    <SelectItem value="crew_callout">Crew Call-Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What did they do great?"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={!formData.employee_id}>
                  Log Event
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
        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Leaderboard
            </CardTitle>
            <CardDescription>Top performers by recognition count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leaderboard.map((emp, index) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                      ${index === 0 ? 'bg-yellow-400 text-white' : ''}
                      ${index === 1 ? 'bg-gray-300 text-gray-700' : ''}
                      ${index === 2 ? 'bg-orange-300 text-white' : ''}
                      ${index > 2 ? 'bg-gray-200 text-gray-600' : ''}
                    `}>
                      {index + 1}
                    </span>
                    <span className="font-medium">{emp.name}</span>
                  </div>
                  <Badge variant="secondary">{emp.score} pts</Badge>
                </div>
              ))}
              {leaderboard.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No performance events yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Recognition</CardTitle>
            <CardDescription>{events.length} events total</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length > 0 ? (
                  events.slice(0, 20).map((event) => {
                    const typeInfo = getTypeInfo(event.type);
                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          {format(new Date(event.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {getEmployeeName(event.employee_id)}
                        </TableCell>
                        <TableCell>
                          <Badge className={typeInfo.color}>
                            <span className="flex items-center gap-1">
                              {typeInfo.icon}
                              {typeInfo.label}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-500 max-w-[200px] truncate">
                          {event.description || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No recognition events yet. Start logging great work!
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
