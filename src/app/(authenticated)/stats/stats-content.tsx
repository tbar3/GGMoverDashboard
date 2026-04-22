'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { differenceInMonths, format } from 'date-fns';
import { CONFIG, Employee, Attendance, PerformanceEvent, PerfectWeek, MileageEntry } from '@/types';
import { CalendarCheck, Clock, TrendingUp, Award } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface StatsContentProps {
  employee: Employee;
  attendance: Attendance[];
  performanceEvents: PerformanceEvent[];
  perfectWeeks: PerfectWeek[];
  currentMonthAttendance: Attendance[];
  checklistsCompleted: number;
  totalMiles: number;
  totalMileageAmount: number;
  monthLabel: string;
  monthStartStr: string;
  monthEndStr: string;
}

export function StatsContent({
  employee, attendance, performanceEvents, perfectWeeks,
  currentMonthAttendance, checklistsCompleted, totalMiles, totalMileageAmount, monthLabel,
  monthStartStr, monthEndStr,
}: StatsContentProps) {
  const { t } = useI18n();

  const tenureMonths = differenceInMonths(new Date(), new Date(employee.start_date));
  const tardyCount = currentMonthAttendance.filter(a => a.is_tardy).length;
  const uniformCount = currentMonthAttendance.filter(a => !a.in_uniform).length;
  const daysWorked = currentMonthAttendance.length;
  const onTimePercentage = daysWorked > 0 ? Math.round(((daysWorked - tardyCount) / daysWorked) * 100) : 100;

  const monthStart = new Date(monthStartStr);
  const monthEnd = new Date(monthEndStr);

  const perfectWeeksThisMonth = perfectWeeks.filter(pw => {
    const ws = new Date(pw.week_start);
    return ws >= monthStart && ws <= monthEnd;
  }).length;

  const perfEventsThisMonth = performanceEvents.filter(pe => {
    const d = new Date(pe.date);
    return d >= monthStart && d <= monthEnd;
  }).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('stats.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('stats.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Clock className="h-4 w-4" />{t('stats.tenure')}</CardDescription>
            <CardTitle className="text-3xl">{tenureMonths}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {tenureMonths === 1 ? t('dash.month_share') : t('dash.months_shares', { count: tenureMonths })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><CalendarCheck className="h-4 w-4" />{t('stats.on_time_rate')}</CardDescription>
            <CardTitle className={`text-3xl ${onTimePercentage >= 90 ? 'text-green-600' : onTimePercentage >= 75 ? 'text-destructive' : 'text-destructive'}`}>
              {onTimePercentage}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('stats.days_this_month', { ontime: daysWorked - tardyCount, total: daysWorked })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Award className="h-4 w-4" />{t('stats.perfect_weeks')}</CardDescription>
            <CardTitle className="text-3xl text-green-600">{perfectWeeksThisMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('stats.this_month_total', { total: perfectWeeks.length })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t('stats.perf_score')}</CardDescription>
            <CardTitle className="text-3xl">{perfEventsThisMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('stats.events_this_month')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('stats.recent_attendance')}</CardTitle>
            <CardDescription>{t('stats.last_work_days')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('stats.date')}</TableHead>
                  <TableHead>{t('stats.arrival')}</TableHead>
                  <TableHead>{t('stats.status')}</TableHead>
                  <TableHead>{t('stats.uniform')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.length > 0 ? (
                  attendance.slice(0, 10).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{format(new Date(record.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{record.arrival_time || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={record.is_tardy ? 'destructive' : 'default'}>
                          {record.is_tardy ? t('stats.tardy') : t('stats.on_time')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.in_uniform ? 'default' : 'destructive'}>
                          {record.in_uniform ? t('stats.yes') : t('stats.no')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t('stats.no_attendance')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('stats.recognition_history')}</CardTitle>
            <CardDescription>{t('stats.your_events')}</CardDescription>
          </CardHeader>
          <CardContent>
            {performanceEvents.length > 0 ? (
              <div className="space-y-3">
                {performanceEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
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
              <p className="text-muted-foreground text-sm text-center py-8">{t('stats.no_attendance')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('stats.mileage_month')}</CardTitle>
            <CardDescription>{t('stats.mileage_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-secondary/40 rounded-lg">
              <div>
                <p className="text-2xl font-bold text-primary">${totalMileageAmount.toFixed(2)}</p>
                <p className="text-sm text-primary">{totalMiles.toFixed(1)} miles @ ${CONFIG.MILEAGE_RATE}/mi</p>
              </div>
              <Badge variant="outline" className="bg-white">{monthLabel}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('stats.profile_summary')}</CardTitle>
            <CardDescription>{t('stats.employment_details')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('dash.role')}</span>
              <Badge variant="outline" className="capitalize">{employee.role}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('dash.start_date')}</span>
              <span className="font-medium">{format(new Date(employee.start_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('stats.tenure_shares')}</span>
              <span className="font-medium">{tenureMonths}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('dash.checklists_completed')}</span>
              <span className="font-medium">{checklistsCompleted} {t('stats.this_month')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('stats.uniform_violations')}</span>
              <span className={`font-medium ${uniformCount === 0 ? 'text-green-600' : 'text-destructive'}`}>{uniformCount} {t('stats.this_month')}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
