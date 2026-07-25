'use server';

import { headers } from 'next/headers';
import { clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function appBase(): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'goodguys-dashboard.vercel.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Set the employee's login email (so it matches the account they'll create) and
 * send a Clerk invitation. They get an email with a link to set a password and
 * land in their crew app. The email on the record MUST equal the invited email —
 * that's how sign-in maps a Clerk user back to the employee — so we save it here.
 */
export async function inviteEmployee(employeeId: string, email: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address' };
  if (clean.endsWith('@crew.goodguysserve.com')) {
    return { ok: false, error: 'That is a placeholder email — set their real email first, then invite.' };
  }

  // Point the employee record at the email they'll sign up with.
  try {
    await query('UPDATE employees SET email = $2 WHERE id = $1', [employeeId, clean]);
  } catch {
    return { ok: false, error: 'Another employee already uses that email' };
  }

  try {
    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: clean,
      redirectUrl: `${await appBase()}/sign-up`,
      ignoreExisting: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not send the invite';
    return { ok: false, error: msg.slice(0, 160) };
  }

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath('/admin/employees');
  return { ok: true };
}
