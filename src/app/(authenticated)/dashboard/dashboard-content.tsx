'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { CONFIG, Employee, Attendance, PerfectWeek, MileageEntry, PerformanceEvent, ChecklistCompletion, Job } from '@/types';
import { differenceInMonths } from 'date-fns';

interface DashboardContentProps {
  employee: Employee;
  attendance: Attendance[];
  perfectWeeks: PerfectWeek[];
  mileage: MileageEntry[];
  performanceEvents: PerformanceEvent[];
  checklistCompletions: ChecklistCompletion[];
  upcomingJobs: Job[];
  today: string;
  monthLabel: string;
}

export function DashboardContent({
  employee, attendance, perfectWeeks, mileage,
  performanceEvents, checklistCompletions, upcomingJobs, today, monthLabel,
}: DashboardContentProps) {
  const { t } = useI18n();

  const tenureMonths = differenceInMonths(new Date(), new Date(employee.start_date));
  const tardyCount = attendance.filter(a => a.is_tardy).length;
  const daysWorked = attendance.length;
  const perfectWeekCount = perfectWeeks.length;
  const totalMiles = mileage.reduce((sum, m) => sum + Number(m.miles), 0);
  const totalMileageAmount = mileage.reduce((sum, m) => sum + Number(m.amount), 0);
  const checklistsCompleted = checklistCompletions.length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t('dash.welcome', { name: employee.name.split(' ')[0] })}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('dash.summary_for', { period: monthLabel })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/stats">
          <Card className="cursor-pointer hover:bg-muted transition-colors">
            <CardHeader className="pb-2">
              <CardDescription>{t('dash.tenure')}</CardDescription>
              <CardTitle className="text-3xl">{tenureMonths}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {tenureMonths === 1
                  ? t('dash.month_share')
                  : t('dash.months_shares', { count: tenureMonths })}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/stats">
          <Card className="cursor-pointer hover:bg-muted transition-colors">
            <CardHeader className="pb-2">
              <CardDescription>{t('dash.perfect_weeks')}</CardDescription>
              <CardTitle className="text-3xl">{perfectWeekCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {perfectWeekCount === 1
                  ? t('dash.bonus_hour')
                  : t('dash.bonus_hours', { count: perfectWeekCount })}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/stats">
          <Card className="cursor-pointer hover:bg-muted transition-colors">
            <CardHeader className="pb-2">
              <CardDescription>{t('dash.tardies')}</CardDescription>
              <CardTitle className="text-3xl">
                <span className={tardyCount === 0 ? 'text-green-600' : 'text-destructive'}>
                  {tardyCount}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('dash.days_worked', { count: daysWorked })}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payroll">
          <Card className="cursor-pointer hover:bg-muted transition-colors">
            <CardHeader className="pb-2">
              <CardDescription>{t('dash.mileage_earnings')}</CardDescription>
              <CardTitle className="text-3xl">
                ${totalMileageAmount.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('dash.miles_at', { miles: totalMiles, rate: CONFIG.MILEAGE_RATE })}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Upcoming Jobs */}
      {upcomingJobs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dash.upcoming_jobs')}</CardTitle>
                <CardDescription>{t('dash.next_moves')}</CardDescription>
              </div>
              <Link href="/jobs">
                <Button variant="outline" size="sm">{t('dash.view_all')}</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingJobs.map((job) => (
                <div key={job.id} className={`flex items-start justify-between p-3 rounded-lg border ${job.date === today ? 'bg-secondary/40 border-blue-200' : 'bg-muted'}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{job.customer_name}</span>
                      {job.job_number && <Badge variant="outline" className="text-xs">{job.job_number}</Badge>}
                      {job.date === today && <Badge className="bg-primary text-xs">{t('dash.today')}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{format(new Date(job.date), 'EEE, MMM d')}</span>
                      {job.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />{job.start_time}
                        </span>
                      )}
                    </div>
                    {job.pickup_address && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[300px]">{job.pickup_address}</span>
                      </div>
                    )}
                  </div>
                  {job.truck_name && (
                    <Badge variant="secondary">{job.truck_name}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('dash.recognition')}</CardTitle>
            <CardDescription>{t('dash.recognition_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {performanceEvents.length > 0 ? (
              <div className="space-y-3">
                {performanceEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <Badge variant={event.type === 'five_star_review' ? 'default' : event.type === 'customer_callout' ? 'secondary' : 'outline'}>
                        {event.type === 'five_star_review' ? t('dash.five_star') : event.type === 'customer_callout' ? t('dash.customer') : t('dash.crew')}
                      </Badge>
                      <span className="text-sm">{event.description || t('dash.great_work')}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(event.date), 'MMM d')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t('dash.no_recognition')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dash.at_a_glance')}</CardTitle>
            <CardDescription>{t('dash.your_metrics')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between items-center p-2 rounded-md">
              <span className="text-sm text-muted-foreground">{t('dash.role')}</span>
              <Badge variant="outline" className="capitalize">{employee.role}</Badge>
            </div>
            <Link href="/checklists" className="flex justify-between items-center p-2 rounded-md hover:bg-muted transition-colors cursor-pointer">
              <span className="text-sm text-muted-foreground">{t('dash.checklists_completed')}</span>
              <span className="font-medium">{checklistsCompleted} &rarr;</span>
            </Link>
            <Link href="/stats" className="flex justify-between items-center p-2 rounded-md hover:bg-muted transition-colors cursor-pointer">
              <span className="text-sm text-muted-foreground">{t('dash.attendance_rate')}</span>
              <span className="font-medium">
                {daysWorked > 0 ? `${Math.round(((daysWorked - tardyCount) / daysWorked) * 100)}%` : 'N/A'} &rarr;
              </span>
            </Link>
            <Link href="/stats" className="flex justify-between items-center p-2 rounded-md hover:bg-muted transition-colors cursor-pointer">
              <span className="text-sm text-muted-foreground">{t('dash.performance_events')}</span>
              <span className="font-medium">{performanceEvents.length} &rarr;</span>
            </Link>
            <div className="flex justify-between items-center p-2 rounded-md">
              <span className="text-sm text-muted-foreground">{t('dash.start_date')}</span>
              <span className="font-medium">{format(new Date(employee.start_date), 'MMM d, yyyy')}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
