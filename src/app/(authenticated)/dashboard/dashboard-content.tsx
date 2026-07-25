'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import {
  MapPin,
  Clock,
  Check,
  X,
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
  Job,
} from '@/types';
import type { Message } from '@/lib/messages';
import { respondToJob } from '@/lib/crew-actions';
import { SkillCelebration, type CelebrationSkill } from '@/components/crew/skill-celebration';
import { WeeklyBonusCard } from '@/components/crew/weekly-bonus';
import type { EmployeeWeek } from '@/lib/bonus';

export type WeekJob = Job & {
  response: 'accepted' | 'declined' | null;
  decline_reason: string | null;
};

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

// One job row with accept/decline. Declining opens a required-reason input.
function JobRow({ job, isToday }: { job: WeekJob; isToday: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function respond(response: 'accepted' | 'declined', declineReason?: string) {
    setPending(true);
    setError(null);
    const res = await respondToJob(job.id, response, declineReason);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
      return;
    }
    setDeclining(false);
    setReason('');
    router.refresh();
  }

  return (
    <div className={`rounded-lg border p-3 ${isToday ? 'bg-secondary/40 border-blue-200' : 'bg-muted'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{job.customer_name}</span>
            {job.job_number && (
              <Badge variant="outline" className="text-xs">
                {job.job_number}
              </Badge>
            )}
            {isToday && <Badge className="bg-primary text-xs">{t('dash.today')}</Badge>}
            {job.response === 'accepted' && (
              <Badge className="bg-green-600 text-xs">{t('dash.accepted')}</Badge>
            )}
            {job.response === 'declined' && (
              <Badge className="bg-destructive text-xs">{t('dash.declined')}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span>{format(new Date(job.date), 'EEE, MMM d')}</span>
            {job.start_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {job.start_time}
              </span>
            )}
            {job.pickup_address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[240px]">{job.pickup_address}</span>
              </span>
            )}
          </div>
          {job.response === 'declined' && job.decline_reason && (
            <p className="text-xs text-destructive">
              {t('dash.reason', { reason: job.decline_reason })}
            </p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          {job.truck_name && <Badge variant="secondary">{job.truck_name}</Badge>}
          {!declining && (
            <div className="flex gap-2">
              {job.response !== 'accepted' && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => respond('accepted')}>
                  <Check className="h-4 w-4 mr-1" /> {t('dash.accept')}
                </Button>
              )}
              {job.response !== 'declined' && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
                  <X className="h-4 w-4 mr-1" /> {t('dash.decline')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {declining && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Input
            placeholder={t('dash.decline_reason_ph')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !reason.trim()}
              onClick={() => respond('declined', reason)}
            >
              {t('dash.confirm_decline')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDeclining(false);
                setError(null);
              }}
            >
              {t('dash.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
