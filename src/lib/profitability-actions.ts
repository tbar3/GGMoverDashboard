'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

const CATEGORIES = new Set(['overhead', 'debt', 'salary', 'other']);

export async function addOperatingCost(input: {
  year: number;
  month: number; // 1-12
  category: string;
  label: string;
  amount: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!CATEGORIES.has(input.category)) return { ok: false, error: 'Pick a category' };
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Add a label' };
  const amount = parseFloat(String(input.amount).replace(/[$,]/g, ''));
  if (isNaN(amount)) return { ok: false, error: 'Enter a valid amount' };
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return { ok: false, error: 'Invalid month' };
  }

  const periodMonth = `${input.year}-${String(input.month).padStart(2, '0')}-01`;
  await query(
    `INSERT INTO operating_costs (period_month, category, label, amount, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [periodMonth, input.category, label, amount, guard.employee.id]
  );
  revalidatePath('/admin/profitability');
  return { ok: true };
}

export async function deleteOperatingCost(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM operating_costs WHERE id = $1', [id]);
  revalidatePath('/admin/profitability');
  return { ok: true };
}
