import { queryOne } from '@/lib/db';
import { sendEmail, escHtml } from '@/lib/email';

// Emails the back office when a crew member declines an assigned job, including the
// reason they gave — so someone can re-staff the move right away. Recipients default
// to the owners' inboxes but can be overridden with JOB_DECLINE_ALERT_TO (comma-
// separated). Best-effort: a failure here must never break the decline itself.

const DEFAULT_RECIPIENTS = [
  'info@goodguysserve.com',
  'andrew@goodguysserve.com',
  'trent@goodguysserve.com',
];

function recipients(): string[] {
  const env = (process.env.JOB_DECLINE_ALERT_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return env.length > 0 ? env : DEFAULT_RECIPIENTS;
}

interface DeclineJobRow {
  customer_name: string | null;
  job_number: string | null;
  job_date: string | null;
  start_time: string | null;
}

/**
 * Notify the back office that `employeeName` declined `jobId`, with `reason`.
 * Returns the sendEmail result; callers should not throw on failure.
 */
export async function notifyAdminsOfDecline(
  jobId: string,
  employeeName: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const job = await queryOne<DeclineJobRow>(
    `SELECT customer_name, job_number, date::text AS job_date, start_time
       FROM jobs WHERE id = $1`,
    [jobId]
  );

  const customer = job?.customer_name || 'a job';
  const dateLabel = job?.job_date
    ? new Date(`${job.job_date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'an upcoming date';
  const jobNo = job?.job_number ? ` (#${job.job_number})` : '';
  const time = job?.start_time ? ` at ${job.start_time}` : '';

  const subject = `Job declined: ${employeeName} — ${customer} ${dateLabel}`.trim();
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 4px">Job declined</h2>
      <p style="margin:0 0 16px;color:#475569">A crew member declined an assigned job — it may need to be re-staffed.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">Crew member</td><td style="padding:6px 0;font-weight:600">${escHtml(employeeName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Customer</td><td style="padding:6px 0;font-weight:600">${escHtml(customer)}${escHtml(jobNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Date</td><td style="padding:6px 0">${escHtml(dateLabel)}${escHtml(time)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">Reason</td><td style="padding:6px 0">${escHtml(reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0">
        <a href="https://goodguysserve.com/admin/responses" style="color:#2563eb">View all crew responses &rarr;</a>
      </p>
    </div>`;

  return sendEmail({ to: recipients(), subject, html });
}
