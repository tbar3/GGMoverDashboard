// Minimal Resend sender via their REST API (no extra dependency). Configure with
// RESEND_API_KEY and RESEND_FROM (a verified sender, e.g.
// "GoodGuys Materials <materials@goodguysserve.com>"). Env vars apply on deploy.

export interface EmailInput {
  to: string[];
  subject: string;
  html: string;
}

export async function sendEmail(
  input: EmailInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY || process.env.RESEND_API;
  const from =
    process.env.RESEND_FROM ||
    process.env.MATERIALS_ALERT_FROM ||
    'GoodGuys Materials <onboarding@resend.dev>';
  if (!key) return { ok: false, error: 'RESEND_API_KEY / RESEND_API not set' };

  const to = (input.to ?? []).map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return { ok: false, error: 'No recipients' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Escape a value for safe inclusion in email HTML. */
export function escHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
