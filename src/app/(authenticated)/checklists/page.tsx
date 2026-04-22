'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardCheck, Check, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
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
    case 'driver': return DRIVER_CHECKLIST;
    case 'lead': return LEAD_CHECKLIST;
    case 'helper': return HELPER_CHECKLIST;
    default: return HELPER_CHECKLIST;
  }
}

export default function ChecklistsPage() {
  const { t } = useI18n();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [completions, setCompletions] = useState<Record<string, ChecklistCompletion>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const meRes = await fetch('/api/me');
    if (!meRes.ok) { setLoading(false); return; }
    const emp: Employee = await meRes.json();
    setEmployee(emp);

    const today = format(new Date(), 'yyyy-MM-dd');
    const jobsRes = await fetch(`/api/jobs?date=${today}&employee_id=${emp.id}`);
    const jobsData: Job[] = jobsRes.ok ? await jobsRes.json() : [];
    setJobs(jobsData);

    if (jobsData.length > 0) {
      const jobIds = jobsData.map(j => j.id).join(',');
      const checklistRes = await fetch(`/api/checklists?employee_id=${emp.id}&job_ids=${jobIds}`);
      if (checklistRes.ok) {
        const completionsData: ChecklistCompletion[] = await checklistRes.json();
        const completionsMap: Record<string, ChecklistCompletion> = {};
        completionsData.forEach(c => { completionsMap[c.job_id] = c; });
        setCompletions(completionsMap);
      }
    }

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

    const res = await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        employee_id: employee.id,
        role: employee.role === 'owner' || employee.role === 'manager' ? 'lead' : employee.role,
        items_completed: newItems,
        completed_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      toast.error('Failed to save checklist');
      setSaving(null);
      return;
    }

    setCompletions(prev => ({
      ...prev,
      [jobId]: { ...prev[jobId], job_id: jobId, employee_id: employee.id, items_completed: newItems } as ChecklistCompletion,
    }));

    setSaving(null);
  }

  // Translate a checklist item label using its id as key
  function translateItem(item: ChecklistItem): string {
    const translated = t(`cl.${item.id}`);
    // If translation key returns the key itself, fall back to original label
    return translated === `cl.${item.id}` ? item.label : translated;
  }

  if (loading) {
    return <div className="p-6">{t('check.loading')}</div>;
  }

  if (!employee) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6"><p className="text-muted-foreground">{t('dash.profile_not_found')}</p></CardContent></Card>
      </div>
    );
  }

  const checklist = getChecklistForRole(employee.role);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('check.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('check.today_checklists')} - {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">{t('check.your_role', { role: '' })} <Badge className="capitalize ml-1">{employee.role}</Badge></p>
                <p className="text-sm text-muted-foreground">{t('check.items_to_complete', { count: checklist.length })}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                        <Badge className="bg-green-500"><Check className="h-3 w-3 mr-1" />{t('check.complete')}</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {job.pickup_address} &rarr; {job.dropoff_address}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{progress}%</p>
                    <p className="text-sm text-muted-foreground">{completedItems.length}/{checklist.length}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {checklist.map((item) => {
                    const isChecked = completedItems.includes(item.id);
                    return (
                      <div key={item.id} className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${isChecked ? 'bg-green-50 border-green-200' : 'bg-white hover:bg-muted'}`}>
                        <Checkbox
                          id={`${job.id}-${item.id}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleItem(job.id, item.id)}
                          disabled={saving === job.id}
                        />
                        <Label htmlFor={`${job.id}-${item.id}`} className={`flex-1 cursor-pointer ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                          {translateItem(item)}
                        </Label>
                        {saving === job.id && <Clock className="h-4 w-4 text-muted-foreground/70 animate-spin" />}
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
            <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t('check.no_jobs')}</p>
            <p className="text-sm text-muted-foreground/70 mt-2">{t('check.jobs_appear')}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('check.reference')}</CardTitle>
          <CardDescription>{t('check.role_items', { role: employee.role })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {checklist.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                <span className="w-6 h-6 rounded-full bg-secondary text-primary flex items-center justify-center text-xs font-medium">{index + 1}</span>
                {translateItem(item)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
