'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, MapPin, Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { respondToJob } from '@/lib/crew-actions';
import type { Job } from '@/types';
import { formatDate } from '@/lib/utils';

export type WeekJob = Job & {
  response: 'accepted' | 'declined' | null;
  decline_reason: string | null;
};

export function JobRow({
  job,
  isToday,
  onChanged,
}: {
  job: WeekJob;
  isToday: boolean;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const declined = job.response === 'declined';

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
    onChanged?.();
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        declined
          ? 'bg-muted/50 border-dashed opacity-70'
          : isToday
            ? 'bg-secondary/40 border-blue-200'
            : 'bg-muted'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${declined ? 'line-through text-muted-foreground' : ''}`}>
              {job.customer_name}
            </span>
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
            <span>{formatDate(job.date, 'EEE, MMM d')}</span>
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
          {!declining && !declined && (
            <div className="flex gap-2">
              {job.response !== 'accepted' && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => respond('accepted')}>
                  <Check className="h-4 w-4 mr-1" /> {t('dash.accept')}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
                <X className="h-4 w-4 mr-1" /> {t('dash.decline')}
              </Button>
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
