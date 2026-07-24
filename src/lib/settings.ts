import { queryOne } from '@/lib/db';
import { CONFIG } from '@/types';

/** Read a numeric app setting, falling back to a default if unset/invalid. */
export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const row = await queryOne<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [
    key,
  ]);
  if (!row) return fallback;
  const n = parseFloat(row.value);
  return isNaN(n) ? fallback : n;
}

/** The pay-scale base hourly rate (editable in the pay-scale admin panel). */
export async function getBaseRate(): Promise<number> {
  return getNumberSetting('base_hourly_rate', CONFIG.BASE_HOURLY_RATE);
}
