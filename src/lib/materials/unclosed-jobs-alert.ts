import { query } from '@/lib/db';
import { sendEmail, escHtml } from '@/lib/email';

export interface UnclosedJob {
  id: number;
  customer: string | null;
  job_number: string | null;
  crew: string | null;
  crew_lead: string | null;
  truck_name: string;
  job_date: string;
}

/** Materials count sheets from a specific day that were never marked complete. */
export async function getUnclosedJobsForDay(day: string): Promise<UnclosedJob[]> {
  return query<UnclosedJob>(
    `SELECT mj.id, mj.customer, mj.job_number, mj.crew, mj.crew_lead,
            t.name AS truck_name, mj.job_date::text AS job_date
       FROM materials_jobs mj
       JOIN trucks t ON t.id = mj.truck_id
      WHERE mj.job_date = $1 AND mj.status <> 'complete'
      ORDER BY t.name, mj.sequence_no`,
    [day]
  );
}

/** Recipients: MATERIALS_ALERT_TO env, else active owner/admin employee emails. */
async function recipients(): Promise<string[]> {
  const env = process.env.MATERIALS_ALERT_TO;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  const rows = await query<{ email: string }>(
    `SELECT email FROM employees
      WHERE role IN ('owner','admin') AND is_active = TRUE
        AND email NOT LIKE '%@crew.goodguysserve.com'`
  );
  return rows.map((r) => r.email).filter(Boolean);
}

/**
 * Email the jobs left unclosed on the PREVIOUS day (America/New_York). One digest,
 * not a rolling backlog — sends nothing when everything from yesterday is closed.
 */
export async function sendUnclosedJobsAlert(
  dayOverride?: string
): Promise<{ ok: boolean; day: string; count: number; sent: boolean; error?: string }> {
  const day =
    dayOverride ??
    (await query<{ d: string }>(
      "SELECT ((NOW() AT TIME ZONE 'America/New_York')::date - 1)::text AS d"
    ))[0].d;

  const jobs = await getUnclosedJobsForDay(day);
  if (jobs.length === 0) return { ok: true, day, count: 0, sent: false };

  const to = await recipients();
  if (to.length === 0)
    return { ok: false, day, count: jobs.length, sent: false, error: 'No recipients configured' };

  const rowsHtml = jobs
    .map(
      (j) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${escHtml(j.customer ?? '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${escHtml(j.job_number ?? '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${escHtml(j.crew ?? j.crew_lead ?? '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${escHtml(j.truck_name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${escHtml(j.job_date)}</td>
      </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a44">
      <h2 style="margin:0 0 4px">${jobs.length} count sheet${jobs.length === 1 ? '' : 's'} not closed out</h2>
      <p style="margin:0 0 14px;color:#5b6478">From ${escHtml(day)}. Close ${jobs.length === 1 ? 'it' : 'them'} out so truck counts stay accurate.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="text-align:left;background:#1f2a44;color:#fff">
            <th style="padding:8px 10px">Customer</th>
            <th style="padding:8px 10px">Job #</th>
            <th style="padding:8px 10px">Crew</th>
            <th style="padding:8px 10px">Truck</th>
            <th style="padding:8px 10px">Date</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  const subject = `⚠ ${jobs.length} materials count sheet${jobs.length === 1 ? '' : 's'} not closed — ${day}`;
  const res = await sendEmail({ to, subject, html });
  return { ok: res.ok, day, count: jobs.length, sent: res.ok, error: res.error };
}
