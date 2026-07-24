'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

// Message board writes — back office only. Every action self-guards.

function revalidate() {
  revalidatePath('/admin/messages');
  revalidatePath('/dashboard');
}

export async function createMessage(formData: FormData) {
  const guard = await requireBackOffice();
  if (!guard.ok) throw new Error('Back office access required');

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const pinned = formData.get('pinned') === 'on';
  if (!title || !body) throw new Error('Title and message are required');

  await query(
    `INSERT INTO messages (author_id, author_name, title, body, pinned)
     VALUES ($1, $2, $3, $4, $5)`,
    [guard.employee.id, guard.employee.name, title, body, pinned]
  );
  revalidate();
}

export async function togglePin(id: string, pinned: boolean) {
  const guard = await requireBackOffice();
  if (!guard.ok) throw new Error('Back office access required');
  await query('UPDATE messages SET pinned = $2, updated_at = NOW() WHERE id = $1', [id, pinned]);
  revalidate();
}

export async function deleteMessage(id: string) {
  const guard = await requireBackOffice();
  if (!guard.ok) throw new Error('Back office access required');
  await query('DELETE FROM messages WHERE id = $1', [id]);
  revalidate();
}
