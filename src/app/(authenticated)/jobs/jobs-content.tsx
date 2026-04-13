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
        <h1 className="text-2xl font-bold text-gray-900">{t('jobs.title')}</h1>
        <p className="text-gray-500 mt-1">{t('jobs.subtitle')}</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
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
              <p className="text-gray-500 text-center">{t('jobs.no_upcoming')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {pastJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('jobs.recent_past')}</h2>
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
    <Card className={isToday ? 'border-blue-300 bg-blue-50/30' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{job.customer_name}</CardTitle>
            {job.job_number && <Badge variant="outline">{job.job_number}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {isToday && <Badge className="bg-blue-600">{t('dash.today')}</Badge>}
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
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm">{job.pickup_address}</p>
              {job.property_type && <p className="text-xs text-gray-500">{job.property_type}</p>}
            </div>
          </div>
        )}
        {job.arrival_window && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm">{t('jobs.arrival', { window: job.arrival_window })}</p>
          </div>
        )}
        {job.customer_phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-400 shrink-0" />
            <a href={`tel:${job.customer_phone}`} className="text-sm text-blue-600 hover:underline">{job.customer_phone}</a>
          </div>
        )}
        {!compact && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              {job.truck_name && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm">{t('jobs.truck', { name: job.truck_name })}</span>
                </div>
              )}
              {job.estimated_hours && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm">{t('jobs.est_hours', { hours: job.estimated_hours })}</span>
                </div>
              )}
            </div>
            {crewMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">{t('jobs.crew_count', { count: crewMembers.length })}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {crewMembers.map((member, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                      <span>{member.name}</span>
                      <a href={`tel:${member.phone}`} className="text-xs text-blue-600 hover:underline">{member.phone}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {job.crew_notes && (
              <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3">
                <FileText className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">{t('jobs.crew_notes')}</p>
                  <p className="text-sm text-yellow-700">{job.crew_notes}</p>
                </div>
              </div>
            )}
            {job.customer_notes && (
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3">
                <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">{t('jobs.customer_notes')}</p>
                  <p className="text-sm text-blue-700">{job.customer_notes}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
