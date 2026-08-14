'use server';

import { revalidatePath } from 'next/cache';
import { requireBackOffice } from '@/lib/auth';
import { query } from '@/lib/db';
import { tenurePeriodMeta } from '@/lib/tenure-bonus';

/** Enter/update the tenure pool (1% of revenue) for a payout period. */
export async function setTenurePool(
  periodKey: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!/^\d{4}-(06|12)$/.test(periodKey)) return { ok: false, error: 'Bad period' };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Pool must be ≥ 0' };

  const meta = tenurePeriodMeta(periodKey);
  await query(
    `INSERT INTO tenure_bonus_periods (period_key, payout_date, window_start, window_end, pool_amount, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (period_key)
       DO UPDATE SET pool_amount = $5, updated_by = $6, updated_at = NOW()`,
    [periodKey, meta.payoutDate, meta.windowStart, meta.windowEnd, amount, guard.employee.id]
  );
  revalidatePath('/admin/tenure-bonus');
  return { ok: true };
}
