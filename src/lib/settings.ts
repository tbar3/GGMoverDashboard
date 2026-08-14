import { query, queryOne } from '@/lib/db';
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

/** Read a string app setting, or null if unset. */
export async function getStringSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [
    key,
  ]);
  return row?.value ?? null;
}

/** Upsert a string app setting. */
export async function setStringSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

/** The pay-scale base hourly rate (editable in the pay-scale admin panel). */
export async function getBaseRate(): Promise<number> {
  return getNumberSetting('base_hourly_rate', CONFIG.BASE_HOURLY_RATE);
}
