'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package,
  BookOpen,
  GraduationCap,
  User,
  Megaphone,
  Pin,
  Award,
} from 'lucide-react';
import { format, differenceInMonths } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import {
  CONFIG,
  Employee,
  Attendance,
  MileageEntry,
  PerformanceEvent,
} from '@/types';
import type { Message } from '@/lib/messages';
import { SkillCelebration, type CelebrationSkill } from '@/components/crew/skill-celebration';
import { WeeklyBonusCard } from '@/components/crew/weekly-bonus';
import type { EmployeeWeek } from '@/lib/bonus';
import { JobRow, type WeekJob } from './job-row';
import { JobsBrowser } from './jobs-browser';

export type { WeekJob };

interface DashboardContentProps {
  employee: Employee;
  hourlyRate: number;
  celebration: { skills: CelebrationSkill[]; newRate: number } | null;
  weekJobs: WeekJob[];
  mileage: MileageEntry[];
  performanceEvents: PerformanceEvent[];
  attendance: Attendance[];
  messages: Message[];
  today: string;
  bonusWeek: EmployeeWeek;
  weekLabel: string;
}

export function DashboardContent({
  employee,
  hourlyRate,
  celebration,
  weekJobs,
  mileage,
  performanceEvents,
  attendance,
  messages,
  today,
  bonusWeek,
  weekLabel,
}: DashboardContentProps) {
  const { t } = useI18n();
  const firstName = employee.name.split(' ')[0];
  const tenureMonths = differenceInMonths(new Date(), new Date(employee.start_date));
  const tardyCount = attendance.filter((a) => a.is_tardy).length;
  const totalMileageAmount = mileage.reduce((sum, m) => sum + Number(m.amount), 0);

  // Estimated hours/pay this week — count only the jobs they haven't declined.
  const workingJobs = weekJobs.filter((j) => j.response !== 'declined');
  const estHours = workingJobs.reduce((s, j) => s + Number(j.estimated_hours ?? 0), 0);
  const estPay = estHours * hourlyRate;

  const quickLinks = [
    { title: t('nav.materials'), desc: t('dash.link_materials_desc'), href: '/materials', icon: Package },
    { title: t('skills.title'), desc: t('skills.link_desc'), href: '/skills', icon: Award },
    { title: t('dash.link_handbook'), desc: t('dash.link_handbook_desc'), href: '/policies', icon: BookOpen },
    { title: t('dash.link_training'), desc: t('dash.link_training_desc'), href: '/training', icon: GraduationCap },
    { title: t('dash.link_profile'), desc: t('dash.link_profile_desc'), href: '/profile', icon: User },
  ];

  return (
    <div className="p-6 space-y-6">
      {celebration && (
        <SkillCelebration skills={celebration.skills} newRate={celebration.newRate} />
      )}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t('dash.welcome', { name: firstName })}
        </h1>
        <p className="text-muted-foreground mt-1">{t('dash.your_week', { week: weekLabel })}</p>
      </div>

      {/* Weekly bonus — where you stand this week */}
      <WeeklyBonusCard week={bonusWeek} />

      {/* This Week */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dash.jobs_this_week')}</CardDescription>
            <CardTitle className="text-3xl">{weekJobs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('dash.youre_working', { count: workingJobs.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dash.est_hours')}</CardDescription>
            <CardTitle className="text-3xl">{estHours.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('dash.across_jobs')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dash.est_pay')}</CardDescription>
            <CardTitle className="text-3xl">${estPay.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('dash.hrs_rate', { hrs: estHours.toFixed(1), rate: hourlyRate.toFixed(2) })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Schedule with accept/decline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dash.your_schedule')}</CardTitle>
          <CardDescription>{t('dash.schedule_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {weekJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('dash.no_jobs_week')}
            </p>
          ) : (
            <div className="space-y-3">
              {weekJobs.map((job) => (
                <JobRow key={job.id} job={job} isToday={job.date === today} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Browse jobs — weekly scroll + custom date range */}
      <JobsBrowser today={today} />

      {/* Message board */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {t('dash.message_board')}
          </CardTitle>
          <CardDescription>{t('dash.announcements')}</CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('dash.no_announcements')}
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {m.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                    <span className="font-semibold text-sm">{m.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{m.body}</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    {m.author_name} · {format(new Date(m.created_at), 'MMM d')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="cursor-pointer hover:bg-muted transition-colors h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-full bg-secondary text-primary shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{link.title}</p>
                    <p className="text-xs text-muted-foreground">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* This month — secondary */}
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
                  <div
                    key={event.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          event.type === 'five_star_review'
                            ? 'default'
                            : event.type === 'customer_callout'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {event.type === 'five_star_review'
                          ? t('dash.five_star')
                          : event.type === 'customer_callout'
                            ? t('dash.customer')
                            : t('dash.crew')}
                      </Badge>
                      <span className="text-sm">{event.description || t('dash.great_work')}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.date), 'MMM d')}
                    </span>
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
            <div className="flex justify-between items-center p-2">
              <span className="text-sm text-muted-foreground">{t('dash.tenure')}</span>
              <span className="font-medium">
                {tenureMonths === 1
                  ? t('dash.month_share_dot')
                  : t('dash.months_shares_dot', { count: tenureMonths })}
              </span>
            </div>
            <Link
              href="/payroll"
              className="flex justify-between items-center p-2 rounded-md hover:bg-muted transition-colors"
            >
              <span className="text-sm text-muted-foreground">{t('dash.mileage_earnings')}</span>
              <span className="font-medium">${totalMileageAmount.toFixed(2)} &rarr;</span>
            </Link>
            <div className="flex justify-between items-center p-2">
              <span className="text-sm text-muted-foreground">{t('dash.tardies')}</span>
              <span
                className={`font-medium ${tardyCount === 0 ? 'text-green-600' : 'text-destructive'}`}
              >
                {tardyCount}
              </span>
            </div>
            <div className="flex justify-between items-center p-2">
              <span className="text-sm text-muted-foreground">{t('dash.mileage_rate')}</span>
              <span className="font-medium">${CONFIG.MILEAGE_RATE}/mi</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
