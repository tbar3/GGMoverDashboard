'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardCheck, Check, Clock } from 'lucide-react';
import {
  Employee,
  Job,
  ChecklistCompletion,
  ChecklistItem,
  DRIVER_CHECKLIST,
  LEAD_CHECKLIST,
  HELPER_CHECKLIST,
} from '@/types';

function getChecklistForRole(role: string): ChecklistItem[] {
  switch (role) {
    case 'driver':
      return DRIVER_CHECKLIST;
    case 'lead':
      return LEAD_CHECKLIST;
    case 'helper':
      return HELPER_CHECKLIST;
    default:
      return HELPER_CHECKLIST;
  }
}

export default function ChecklistsPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [completions, setCompletions] = useState<Record<string, ChecklistCompletion>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get employee
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('email', user.email)
      .single();

    if (!emp) {
      setLoading(false);
      return;
    }
    setEmployee(emp);

    // Get today's jobs where this employee is assigned
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('date', today)
      .contains('crew_ids', [emp.id]);

    setJobs(jobsData || []);

    // Get existing completions
    const { data: completionsData } = await supabase
      .from('checklist_completions')
      .select('*')
      .eq('employee_id', emp.id)
      .in('job_id', (jobsData || []).map(j => j.id));

    const completionsMap: Record<string, ChecklistCompletion> = {};
    completionsData?.forEach(c => {
      completionsMap[c.job_id] = c;
    });
    setCompletions(completionsMap);

    setLoading(false);
  }

  async function toggleItem(jobId: string, itemId: string) {
    if (!employee) return;

    const current = completions[jobId];
    const currentItems = current?.items_completed || [];
    const newItems = currentItems.includes(itemId)
      ? currentItems.filter(id => id !== itemId)
      : [...currentItems, itemId];

    setSaving(jobId);

    const { error } = await supabase
      .from('checklist_completions')
      .upsert({
        job_id: jobId,
        employee_id: employee.id,
        role: employee.role === 'owner' || employee.role === 'manager' ? 'lead' : employee.role as 'driver' | 'lead' | 'helper',
        items_completed: newItems,
        completed_at: new Date().toISOString(),
      }, {
        onConflict: 'job_id,employee_id',
      });

    if (error) {
      toast.error('Failed to save checklist');
      setSaving(null);
      return;
    }

    setCompletions(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        job_id: jobId,
        employee_id: employee.id,
        items_completed: newItems,
      } as ChecklistCompletion,
    }));

    setSaving(null);
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-500">Employee profile not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const checklist = getChecklistForRole(employee.role);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Checklists</h1>
        <p className="text-gray-500 mt-1">
          Today&apos;s job checklists - {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Role Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Your Role: <Badge className="capitalize ml-2">{employee.role}</Badge></p>
                <p className="text-sm text-gray-500">{checklist.length} items to complete per job</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs */}
      {jobs.length > 0 ? (
        jobs.map((job) => {
          const completion = completions[job.id];
          const completedItems = completion?.items_completed || [];
          const progress = Math.round((completedItems.length / checklist.length) * 100);
          const isComplete = completedItems.length === checklist.length;

          return (
            <Card key={job.id} className={isComplete ? 'border-green-200 bg-green-50' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {job.customer_name}
                      {isComplete && (
                        <Badge className="bg-green-500">
                          <Check className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {job.pickup_address} → {job.dropoff_address}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{progress}%</p>
                    <p className="text-sm text-gray-500">
                      {completedItems.length}/{checklist.length}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {checklist.map((item) => {
                    const isChecked = completedItems.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                          isChecked ? 'bg-green-50 border-green-200' : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <Checkbox
                          id={`${job.id}-${item.id}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleItem(job.id, item.id)}
                          disabled={saving === job.id}
                        />
                        <Label
                          htmlFor={`${job.id}-${item.id}`}
                          className={`flex-1 cursor-pointer ${isChecked ? 'line-through text-gray-500' : ''}`}
                        >
                          {item.label}
                        </Label>
                        {saving === job.id && (
                          <Clock className="h-4 w-4 text-gray-400 animate-spin" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No jobs assigned to you for today.</p>
            <p className="text-sm text-gray-400 mt-2">
              Jobs will appear here once you&apos;re assigned to a move.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Checklist Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist Reference</CardTitle>
          <CardDescription>
            Your role-specific checklist items ({employee.role})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {checklist.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </span>
                {item.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
