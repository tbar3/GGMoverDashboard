'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Lock, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Skill } from '@/lib/skills';

interface SkillsContentProps {
  skills: Skill[];
  earnedSkillIds: string[];
  currentRate: number;
  baseRate: number;
  isOverride: boolean;
}

const DELAY_KEYS = [
  'skills.delay.tardies',
  'skills.delay.callout',
  'skills.delay.noshow',
  'skills.delay.damages',
  'skills.delay.crew',
  'skills.delay.customer',
];

export function SkillsContent({
  skills,
  earnedSkillIds,
  currentRate,
  baseRate,
  isOverride,
}: SkillsContentProps) {
  const { t } = useI18n();
  const earned = new Set(earnedSkillIds);
  const earnedCount = skills.filter((s) => earned.has(s.id)).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('skills.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('skills.subtitle')}</p>
      </div>

      {/* Current rate + progress */}
      <Card className="bg-navy-700 text-cream-50 border-navy-700">
        <CardContent className="p-6">
          <p className="gg-eyebrow text-cream-50/70">{t('skills.current_rate')}</p>
          <p className="font-display text-5xl font-bold">
            ${currentRate.toFixed(2)}
            <span className="text-xl font-normal opacity-70">{t('skills.per_hr')}</span>
          </p>
          <p className="mt-3 text-sm opacity-80">
            {t('skills.earned_summary', { earned: earnedCount })} ·{' '}
            {t('skills.base_rate', { rate: baseRate.toFixed(0) })}
          </p>
          {isOverride && (
            <p className="mt-2 text-xs opacity-70">
              * {t('skills.current_rate')} set manually by the office.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Skills grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {skills.map((s) => {
          const has = earned.has(s.id);
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-xl border-2 p-4 ${
                has
                  ? 'border-green-500 bg-green-50'
                  : 'border-dashed border-navy-200 bg-cream-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  has ? 'bg-green-500 text-white' : 'bg-cream-200 text-navy-300'
                }`}
              >
                {has ? <Check className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${has ? 'text-navy-700' : 'text-navy-500'}`}>{s.name}</p>
                <p className={`text-sm ${has ? 'text-green-600' : 'text-navy-300'}`}>
                  {has ? t('skills.earned') : `+$${Number(s.raise_amount).toFixed(0)}/hr`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reasons for delay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {t('skills.delay_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
            {DELAY_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="text-warning">•</span>
                {t(k)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
