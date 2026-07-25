'use server';

import { revalidatePath } from 'next/cache';
import { requireBackOffice } from '@/lib/auth';
import { disconnect, getCompanyInfo, markSynced } from '@/lib/quickbooks';

export async function disconnectQuickBooks(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await disconnect();
  revalidatePath('/admin/quickbooks');
  return { ok: true };
}

/** Prove the connection works by pulling the company profile. */
export async function testQuickBooks(): Promise<{ ok: boolean; company?: string; error?: string }> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  try {
    const info = await getCompanyInfo();
    await markSynced();
    revalidatePath('/admin/quickbooks');
    return { ok: true, company: info.name ?? info.legalName ?? 'Connected' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'Test failed' };
  }
}
