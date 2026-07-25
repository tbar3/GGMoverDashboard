'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Star, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import type { EmployeeWeek, BonusHistoryRow, PayrollComp } from '@/lib/bonus';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function weekLabel(weekStart: string): string {
  const s = new Date(`${weekStart}T12:00:00`);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`;
}

/** The live current-week bonus: where the crew member stands right now. */
export function WeeklyBonusCard({ week }: { week: EmployeeWeek }) {
  const { t } = useI18n();
  const { result } = week;

  const ggPoints = week.positives.filter((p) => p.discretionary);
  const normalPositives = week.positives.filter((p) => !p.discretionary);
  const fullForfeit = result.hasStrike && result.multiplier === 0;
  const partialForfeit = result.hasStrike && result.multiplier > 0;

  // A strike with no surviving GG Points → the whole week is forfeited.
  if (fullForfeit) {
    return (
      <Card className="border-red-300 bg-red-50 dark:bg-red-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            {t('bonus.strike_forfeit')}
          </CardTitle>
          <CardDescription className="text-red-700/80 dark:text-red-400/80">
            {t('bonus.strike_sub')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {week.strikes
              .filter((s) => !s.voided)
              .map((s) => (
                <Badge key={s.id} variant="destructive">
                  {s.label} · {format(new Date(`${s.event_date}T12:00:00`), 'EEE MMM d')}
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={partialForfeit ? 'border-amber-300' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          {partialForfeit ? (
            <Sparkles className="h-5 w-5 text-violet-600" />
          ) : (
            <Star className="h-5 w-5 text-sky-600" />
          )}
          {partialForfeit ? t('bonus.gg_kept_title') : t('bonus.weekly_title')}
        </CardTitle>
        <CardDescription>
          {weekLabel(week.weekStart)} · {partialForfeit ? t('bonus.gg_kept_sub') : t('bonus.weekly_sub')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{result.multiplier}×</p>
            <p className="text-xs text-muted-foreground">{t('bonus.multiplier')}</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{week.hasPayroll ? result.hours.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">{t('bonus.hours_label')}</p>
          </div>
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 p-3">
            <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">
              {week.hasPayroll ? money(result.bonus) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{t('bonus.projected')}</p>
          </div>
        </div>

        {!week.hasPayroll && (
          <p className="text-xs text-muted-foreground text-center">{t('bonus.hours_pending')}</p>
        )}

        {partialForfeit ? (
          <div>
            <p className="text-sm font-medium mb-1.5">{t('bonus.gg_points')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ggPoints.map((p) => (
                <Badge key={p.id} className="bg-violet-100 text-violet-800 hover:bg-violet-100" title={p.note ?? undefined}>
                  {p.label}
                  {p.note ? ` · ${p.note}` : ''} +0.5×
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium mb-1.5">{t('bonus.positives')}</p>
            {result.perfectWeek || week.positives.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {result.perfectWeek && (
                  <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                    {t('bonus.perfect_week')} +0.5×
                  </Badge>
                )}
                {normalPositives.map((p) => (
                  <Badge key={p.id} variant="secondary" title={p.note ?? undefined}>
                    {p.label}
                    {p.note ? ` · ${p.note}` : ''} +0.5×
                  </Badge>
                ))}
                {ggPoints.map((p) => (
                  <Badge key={p.id} className="bg-violet-100 text-violet-800 hover:bg-violet-100" title={p.note ?? undefined}>
                    {p.label}
                    {p.note ? ` · ${p.note}` : ''} +0.5×
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('bonus.no_positives')}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Actual paid bonus + total comp, toggled across week / month / YTD. */
export function PayrollCompCards({ comp }: { comp: PayrollComp }) {
  const { t } = useI18n();
  const [range, setRange] = useState<'week' | 'month' | 'ytd'>('week');
  const figures = comp[range];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['week', 'month', 'ytd'] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={range === r ? 'default' : 'outline'}
            onClick={() => setRange(r)}
          >
            {t(`bonus.filter_${r}`)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('bonus.actual_bonus')}</CardDescription>
            <CardTitle className="text-3xl">{money(figures.bonus)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {range === 'week' && comp.week.label ? weekLabel(comp.week.label) : t(`bonus.filter_${range}`)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('bonus.total_comp')}</CardDescription>
            <CardTitle className="text-3xl">{money(figures.totalComp)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {range === 'week' && comp.week.label ? weekLabel(comp.week.label) : t(`bonus.filter_${range}`)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function BonusHistoryTable({ history }: { history: BonusHistoryRow[] }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {t('bonus.history_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('bonus.none_yet')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('bonus.week_ending')}</TableHead>
                <TableHead className="text-right">{t('bonus.hours_label')}</TableHead>
                <TableHead className="text-right">{t('bonus.multiplier')}</TableHead>
                <TableHead className="text-right">{t('bonus.earned')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.weekStart}>
                  <TableCell>{format(new Date(`${h.weekEnd}T12:00:00`), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">{h.hours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    {h.hasStrike ? <span className="text-destructive">0×</span> : `${h.multiplier}×`}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {h.hasStrike ? (
                      <span className="text-destructive">{t('bonus.forfeited')}</span>
                    ) : (
                      money(h.bonus)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
