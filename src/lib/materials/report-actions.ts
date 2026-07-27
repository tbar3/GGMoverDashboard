'use server';

import { getCurrentEmployee, isBackOffice } from '@/lib/auth';

type Result = { ok: boolean; message: string };

// Emailing reports needs a Resend key, which the hub doesn't have configured yet.
// The report views themselves are fully functional; enabling email is a later,
// small step (add RESEND_API_KEY + a from-address, then wire these to send).
const NOT_CONFIGURED: Result = {
  ok: false,
  message: 'Email reports aren’t set up in the hub yet — ask to enable it (needs a Resend key).',
};

async function guard(): Promise<boolean> {
  const emp = await getCurrentEmployee();
  return !!emp && isBackOffice(emp);
}

export async function emailUsageReport(
  _recipient: string,
  _from: string,
  _to: string
): Promise<Result> {
  if (!(await guard())) return { ok: false, message: 'Back office access required' };
  return NOT_CONFIGURED;
}

export async function emailLeakageReport(_recipient: string): Promise<Result> {
  if (!(await guard())) return { ok: false, message: 'Back office access required' };
  return NOT_CONFIGURED;
}

export async function emailReconcileReport(_recipient: string): Promise<Result> {
  if (!(await guard())) return { ok: false, message: 'Back office access required' };
  return NOT_CONFIGURED;
}
