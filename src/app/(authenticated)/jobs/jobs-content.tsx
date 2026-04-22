'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Job } from '@/types';
import { Clock, MapPin, Phone, Truck, Users, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface JobsContentProps {
  upcomingJobs: Job[];
  pastJobs: Job[];
  today: string;
}

export function JobsContent({ upcomingJobs, pastJobs, today }: JobsContentProps) {
  const { t } = useI18n();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('jobs.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('jobs.subtitle')}</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          {t('jobs.today_upcoming', { count: upcomingJobs.length })}
        </h2>
        {upcomingJobs.length > 0 ? (
          <div className="space-y-4">
            {upcomingJobs.map((job) => (
              <JobCard key={job.id} job={job} isToday={job.date === today} t={t} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground text-center">{t('jobs.no_upcoming')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {pastJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">{t('jobs.recent_past')}</h2>
          <div className="space-y-4">
            {pastJobs.map((job) => (
              <JobCard key={job.id} job={job} isToday={false} t={t} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, isToday, t, compact }: { job: Job; isToday: boolean; t: (key: string, vars?: Record<string, string | number>) => string; compact?: boolean }) {
  const crewMembers = job.crew_manifest || [];

  return (
    <Card className={isToday ? 'border-blue-300 bg-secondary/40/30' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{job.customer_name}</CardTitle>
            {job.job_number && <Badge variant="outline">{job.job_number}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {isToday && <Badge className="bg-primary">{t('dash.today')}</Badge>}
            {job.service_type && <Badge variant="secondary">{job.service_type}</Badge>}
          </div>
        </div>
        <CardDescription>
          {format(new Date(job.date), 'EEEE, MMMM d, yyyy')}
          {job.start_time && job.end_time && ` \u00B7 ${job.start_time} \u2013 ${job.end_time}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {job.pickup_address && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm">{job.pickup_address}</p>
              {job.property_type && <p className="text-xs text-muted-foreground">{job.property_type}</p>}
            </div>
          </div>
        )}
        {job.arrival_window && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground/70 shrink-0" />
            <p className="text-sm">{t('jobs.arrival', { window: job.arrival_window })}</p>
          </div>
        )}
        {job.customer_phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground/70 shrink-0" />
            <a href={`tel:${job.customer_phone}`} className="text-sm text-primary hover:underline">{job.customer_phone}</a>
          </div>
        )}
        {!compact && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              {job.truck_name && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                  <span className="text-sm">{t('jobs.truck', { name: job.truck_name })}</span>
                </div>
              )}
              {job.estimated_hours && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                  <span className="text-sm">{t('jobs.est_hours', { hours: job.estimated_hours })}</span>
                </div>
              )}
            </div>
            {crewMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground/70" />
                  <span className="text-sm font-medium text-muted-foreground">{t('jobs.crew_count', { count: crewMembers.length })}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {crewMembers.map((member, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                      <span>{member.name}</span>
                      <a href={`tel:${member.phone}`} className="text-xs text-primary hover:underline">{member.phone}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {job.crew_notes && (
              <div className="flex items-start gap-2 bg-destructive/10 rounded-lg p-3">
                <FileText className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">{t('jobs.crew_notes')}</p>
                  <p className="text-sm text-destructive">{job.crew_notes}</p>
                </div>
              </div>
            )}
            {job.customer_notes && (
              <div className="flex items-start gap-2 bg-secondary/40 rounded-lg p-3">
                <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">{t('jobs.customer_notes')}</p>
                  <p className="text-sm text-primary">{job.customer_notes}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
