'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays, subWeeks } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { JobRow, type WeekJob } from './job-row';

function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function JobsBrowser({ today }: { today: string }) {
  const { t } = useI18n();
  const todayDate = new Date(`${today}T12:00:00`);

  const [mode, setMode] = useState<'upcoming' | 'week' | 'range'>('upcoming');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(todayDate));
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(iso(addDays(todayDate, 14)));
  const [jobs, setJobs] = useState<WeekJob[]>([]);
  const [loading, setLoading] = useState(false);

  const start = mode === 'week' ? iso(weekStart) : mode === 'range' ? rangeStart : today;
  const end =
    mode === 'week'
      ? iso(endOfWeek(weekStart, { weekStartsOn: 1 }))
      : mode === 'range'
        ? rangeEnd
        : iso(addDays(todayDate, 365));

  const load = useCallback(async (s: string, e: string) => {
    if (s > e) {
      setJobs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/my-jobs?start=${s}&end=${e}`);
      setJobs(res.ok ? await res.json() : []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(start, end);
  }, [start, end, load]);

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
  const isThisWeek = iso(weekStart) === iso(mondayOf(todayDate));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('dash.browse_title')}</CardTitle>
            <CardDescription>{t('dash.browse_desc')}</CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant={mode === 'upcoming' ? 'default' : 'outline'} onClick={() => setMode('upcoming')}>
              {t('dash.upcoming')}
            </Button>
            <Button size="sm" variant={mode === 'week' ? 'default' : 'outline'} onClick={() => setMode('week')}>
              {t('dash.by_week')}
            </Button>
            <Button size="sm" variant={mode === 'range' ? 'default' : 'outline'} onClick={() => setMode('range')}>
              {t('dash.custom_range')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'week' && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[13rem]">
              <p className="font-semibold">{weekLabel}</p>
              {!isThisWeek && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setWeekStart(mondayOf(todayDate))}
                >
                  {t('dash.this_week_btn')}
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {mode === 'range' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t('dash.from')}</Label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('dash.to')}</Label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('dash.no_jobs_range')}</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} isToday={String(job.date).slice(0, 10) === today} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
