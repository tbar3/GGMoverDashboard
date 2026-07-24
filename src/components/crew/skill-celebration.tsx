'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { acknowledgeMySkills } from '@/lib/skills-actions';

const COLORS = ['#012F47', '#D62D3A', '#AFD2E9', '#C98A1F', '#2F7D4F', '#FFF7E4'];

// Deterministic pseudo-random scatter for the confetti (pure — no Math.random,
// so it's render-safe and stable across re-renders).
function scatter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const PIECES = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: scatter(i + 1) * 100,
  delay: scatter(i + 11) * 1.2,
  duration: 2.4 + scatter(i + 21) * 1.8,
  color: COLORS[i % COLORS.length],
  size: 6 + scatter(i + 31) * 8,
}));

export interface CelebrationSkill {
  name: string;
  raise_amount: number;
}

/**
 * Full-screen celebration the crew member sees when they've been granted a new
 * skill (and a raise). Shown until they acknowledge it.
 */
export function SkillCelebration({
  skills,
  newRate,
}: {
  skills: CelebrationSkill[];
  newRate: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);
  const pieces = PIECES;

  const totalRaise = skills.reduce((s, sk) => s + Number(sk.raise_amount), 0);

  async function dismiss() {
    setDismissing(true);
    await acknowledgeMySkills();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              animation: `gg-confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl border-2 border-navy-700 bg-cream-50 p-8 text-center shadow-sign"
        style={{ animation: 'gg-pop-in 0.45s ease-out' }}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-red text-white">
          <PartyPopper className="h-8 w-8" />
        </div>
        <p className="gg-eyebrow mb-1 text-brand-red">{t('skills.congrats')}</p>
        <h2 className="font-display text-2xl font-bold text-navy-700">
          {skills.length === 1
            ? t('skills.you_earned', { skill: skills[0].name })
            : t('skills.you_earned_n', { count: skills.length })}
        </h2>

        {skills.length > 1 && (
          <ul className="mt-3 space-y-1">
            {skills.map((s) => (
              <li key={s.name} className="text-sm font-medium text-navy-600">
                {s.name} <span className="text-green-600">+${Number(s.raise_amount).toFixed(0)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 rounded-xl bg-navy-700 p-4 text-cream-50">
          <p className="text-sm opacity-80">{t('skills.your_raise')}</p>
          <p className="font-display text-3xl font-bold text-green-400">
            +${totalRaise.toFixed(0)}/hr
          </p>
          <p className="mt-1 text-sm opacity-80">
            {t('skills.new_rate', { rate: newRate.toFixed(2) })}
          </p>
        </div>

        <Button onClick={dismiss} disabled={dismissing} className="mt-6 w-full gg-btn-cta">
          {dismissing ? '…' : t('skills.awesome')}
        </Button>
      </div>
    </div>
  );
}
