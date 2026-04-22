'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  Mail,
  Truck,
  Users,
  Weight,
  FileText,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Job, Employee } from '@/types';
import { format } from 'date-fns';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  async function fetchData() {
    const [jobRes, empRes] = await Promise.all([
      fetch(`/api/jobs/${params.id}`),
      fetch('/api/employees?active=true'),
    ]);

    if (jobRes.ok) {
      const jobData = await jobRes.json();
      setJob(jobData);
      setSelectedCrewIds(jobData.crew_ids || []);
    }
    if (empRes.ok) setEmployees(await empRes.json());
    setLoading(false);
  }

  function toggleCrewMember(employeeId: string) {
    setSelectedCrewIds(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  }

  async function handleSaveCrew() {
    setSaving(true);
    const res = await fetch(`/api/jobs/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crew_ids: selectedCrewIds }),
    });

    if (res.ok) {
      const updated = await res.json();
      setJob(updated);
      toast.success('Crew assignment saved');
    } else {
      toast.error('Failed to save crew assignment');
    }
    setSaving(false);
  }

  const hasChanges = job && JSON.stringify(selectedCrewIds.sort()) !== JSON.stringify((job.crew_ids || []).sort());

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading job...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Job not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/jobs')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{job.customer_name}</h1>
            {job.job_number && <Badge variant="outline">{job.job_number}</Badge>}
            {job.service_type && <Badge>{job.service_type}</Badge>}
          </div>
          <p className="text-muted-foreground mt-1">
            {format(new Date(job.date), 'EEEE, MMMM d, yyyy')}
            {job.start_time && job.end_time && ` \u00B7 ${job.start_time} \u2013 ${job.end_time}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Job Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Location & Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {job.pickup_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Origin Address</p>
                    <p>{job.pickup_address}</p>
                    {job.property_type && (
                      <p className="text-sm text-muted-foreground">{job.property_type}</p>
                    )}
                  </div>
                </div>
              )}

              {job.arrival_window && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Arrival Window</p>
                    <p>{job.arrival_window}</p>
                  </div>
                </div>
              )}

              {job.customer_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Customer Phone</p>
                    <p>{job.customer_phone}</p>
                  </div>
                </div>
              )}

              {job.customer_email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Customer Email</p>
                    <p>{job.customer_email}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Move Specs */}
          <Card>
            <CardHeader>
              <CardTitle>Move Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {job.estimated_hours && (
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{job.estimated_hours}</p>
                    <p className="text-xs text-muted-foreground">Est. Hours</p>
                  </div>
                )}
                {job.volume_cuft && (
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{Number(job.volume_cuft).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Cu. Ft.</p>
                  </div>
                )}
                {job.weight_lbs && (
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{Number(job.weight_lbs).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Lbs.</p>
                  </div>
                )}
                {job.revenue && (
                  <div className="text-center p-3 rounded-lg bg-secondary/40">
                    <p className="text-2xl font-bold text-primary">${Number(job.revenue).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{job.pricing_type || 'Revenue'}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {job.job_details && (
                  <div>
                    <span className="text-muted-foreground">Details:</span>{' '}
                    <span className="font-medium">{job.job_details}</span>
                  </div>
                )}
                {job.lead_source && (
                  <div>
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="font-medium">{job.lead_source}</span>
                  </div>
                )}
                {job.branch && (
                  <div>
                    <span className="text-muted-foreground">Branch:</span>{' '}
                    <span className="font-medium">{job.branch}</span>
                  </div>
                )}
                {job.quoted_trucks && (
                  <div>
                    <span className="text-muted-foreground">Quoted:</span>{' '}
                    <span className="font-medium">{job.quoted_trucks} truck(s), {job.quoted_crew} crew</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {(job.dispatch_notes || job.internal_notes || job.crew_notes || job.customer_notes) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.dispatch_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Dispatch Notes</p>
                    <p className="text-sm">{job.dispatch_notes}</p>
                  </div>
                )}
                {job.internal_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Internal Notes</p>
                    <p className="text-sm">{job.internal_notes}</p>
                  </div>
                )}
                {job.crew_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Crew Notes</p>
                    <p className="text-sm">{job.crew_notes}</p>
                  </div>
                )}
                {job.customer_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Customer Notes</p>
                    <p className="text-sm">{job.customer_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SmartMoving Crew (from calendar) */}
          {job.crew_manifest && job.crew_manifest.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  SmartMoving Crew (from calendar)
                </CardTitle>
                <CardDescription>
                  Crew listed in SmartMoving for reference
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {job.crew_manifest.map((member, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-sm text-muted-foreground">{member.phone}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column - Crew Assignment */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Assign Crew
              </CardTitle>
              <CardDescription>
                Select employees to assign to this job
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {employees.map((emp) => (
                <div key={emp.id} className="flex items-center space-x-3 py-1">
                  <Checkbox
                    id={`assign-${emp.id}`}
                    checked={selectedCrewIds.includes(emp.id)}
                    onCheckedChange={() => toggleCrewMember(emp.id)}
                  />
                  <Label htmlFor={`assign-${emp.id}`} className="font-normal flex-1 cursor-pointer">
                    <span className="font-medium">{emp.name}</span>
                    <Badge variant="outline" className="ml-2 capitalize text-xs">
                      {emp.role}
                    </Badge>
                  </Label>
                </div>
              ))}

              {employees.length === 0 && (
                <p className="text-sm text-muted-foreground">No active employees found.</p>
              )}

              <Separator className="my-3" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedCrewIds.length} assigned
                </span>
                <Button
                  onClick={handleSaveCrew}
                  disabled={!hasChanges || saving}
                  size="sm"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Truck */}
          {job.truck_name && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Truck
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {job.truck_name}
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Weight/Volume summary */}
          {(job.volume_cuft || job.weight_lbs) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Weight className="h-5 w-5" />
                  Load
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {job.volume_cuft && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Volume</span>
                    <span className="font-medium">{Number(job.volume_cuft).toLocaleString()} cu ft</span>
                  </div>
                )}
                {job.weight_lbs && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Weight</span>
                    <span className="font-medium">{Number(job.weight_lbs).toLocaleString()} lbs</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
