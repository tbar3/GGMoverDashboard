import { getCalendarClient } from '@/lib/google';
import { parseCalendarEvent } from '@/lib/calendar-parser';
import { query } from '@/lib/db';

export interface SyncResult {
  total_events: number;
  synced: number;
  skipped: number;
  errors: string[];
  unmatched_crew: string[];
}

export type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; status: number; error: string };

/**
 * Read the "SmartMoving Jobs" Google Calendar between two dates and upsert the
 * events into the jobs table (matching crew names to employee ids). Shared by
 * the manual back-office sync and the scheduled cron. Requires the Google
 * connection to already be authorized (a token in google_tokens).
 */
export async function syncCalendarJobs(startDate: string, endDate: string): Promise<SyncOutcome> {
  const calendar = await getCalendarClient();
  if (!calendar) {
    return { ok: false, status: 403, error: 'Google Calendar not connected. Please authorize first.' };
  }

  try {
    const calendarList = await calendar.calendarList.list();
    const smartMovingCal = calendarList.data.items?.find((cal) =>
      cal.summary?.toLowerCase().includes('smartmoving jobs')
    );

    if (!smartMovingCal?.id) {
      return {
        ok: false,
        status: 404,
        error: 'Could not find "SmartMoving Jobs" calendar. Make sure it exists in your Google Calendar.',
      };
    }

    // Page through the whole range. Google returns at most 250 events per call,
    // so without following nextPageToken a wide backfill (e.g. a year of history)
    // would silently stop at the first 250. MAX_PAGES caps a runaway pull at
    // 10,000 events — far more than any real range.
    const MAX_PAGES = 40;
    const timeMin = new Date(startDate).toISOString();
    const timeMax = new Date(endDate + 'T23:59:59').toISOString();

    const firstPage = await calendar.events.list({
      calendarId: smartMovingCal.id,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });
    const events = firstPage.data.items ? [...firstPage.data.items] : [];
    let pageToken: string | undefined = firstPage.data.nextPageToken ?? undefined;
    let pages = 1;
    while (pageToken && pages < MAX_PAGES) {
      const next = await calendar.events.list({
        calendarId: smartMovingCal.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
      });
      if (next.data.items) events.push(...next.data.items);
      pageToken = next.data.nextPageToken ?? undefined;
      pages++;
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unmatchedCrew: string[] = [];

    const employees = await query<{ id: string; name: string }>(
      'SELECT id, name FROM employees WHERE is_active = true AND exclude_from_roster = FALSE'
    );
    const nameToId = new Map<string, string>();
    for (const emp of employees) {
      nameToId.set(emp.name.toLowerCase(), emp.id);
    }

    for (const event of events) {
      const parsed = parseCalendarEvent(event);
      if (!parsed) {
        skipped++;
        continue;
      }

      const matchedCrewIds: string[] = [];
      for (const member of parsed.crew_members) {
        const employeeId = nameToId.get(member.name.toLowerCase());
        if (employeeId) {
          matchedCrewIds.push(employeeId);
        } else if (!unmatchedCrew.includes(member.name)) {
          unmatchedCrew.push(member.name);
        }
      }

      try {
        await query(
          `INSERT INTO jobs (
            date, customer_name, pickup_address, dropoff_address, revenue, crew_ids,
            calendar_event_id, job_number, service_type, start_time, end_time,
            branch, job_details, pricing_type, customer_phone, customer_email,
            lead_source, estimated_hours, volume_cuft, weight_lbs, arrival_window,
            property_type, dispatch_notes, internal_notes, crew_notes, customer_notes,
            quoted_trucks, quoted_crew, truck_name, crew_manifest, synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26,
            $27, $28, $29, $30, NOW()
          )
          ON CONFLICT (calendar_event_id) DO UPDATE SET
            date = EXCLUDED.date,
            customer_name = EXCLUDED.customer_name,
            pickup_address = EXCLUDED.pickup_address,
            revenue = EXCLUDED.revenue,
            crew_ids = EXCLUDED.crew_ids,
            job_number = EXCLUDED.job_number,
            service_type = EXCLUDED.service_type,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            branch = EXCLUDED.branch,
            job_details = EXCLUDED.job_details,
            pricing_type = EXCLUDED.pricing_type,
            customer_phone = EXCLUDED.customer_phone,
            customer_email = EXCLUDED.customer_email,
            lead_source = EXCLUDED.lead_source,
            estimated_hours = EXCLUDED.estimated_hours,
            volume_cuft = EXCLUDED.volume_cuft,
            weight_lbs = EXCLUDED.weight_lbs,
            arrival_window = EXCLUDED.arrival_window,
            property_type = EXCLUDED.property_type,
            dispatch_notes = EXCLUDED.dispatch_notes,
            internal_notes = EXCLUDED.internal_notes,
            crew_notes = EXCLUDED.crew_notes,
            customer_notes = EXCLUDED.customer_notes,
            quoted_trucks = EXCLUDED.quoted_trucks,
            quoted_crew = EXCLUDED.quoted_crew,
            truck_name = EXCLUDED.truck_name,
            crew_manifest = EXCLUDED.crew_manifest,
            synced_at = NOW()
          RETURNING id`,
          [
            parsed.date,
            parsed.customer_name,
            parsed.origin_address || '',
            '',
            parsed.revenue,
            matchedCrewIds,
            parsed.calendar_event_id,
            parsed.job_number,
            parsed.service_type,
            parsed.start_time,
            parsed.end_time,
            parsed.branch,
            parsed.job_details,
            parsed.pricing_type,
            parsed.customer_phone,
            parsed.customer_email,
            parsed.lead_source,
            parsed.estimated_hours,
            parsed.volume_cuft,
            parsed.weight_lbs,
            parsed.arrival_window,
            parsed.property_type,
            parsed.dispatch_notes,
            parsed.internal_notes,
            parsed.crew_notes,
            parsed.customer_notes,
            parsed.quoted_trucks,
            parsed.quoted_crew,
            parsed.truck_name,
            JSON.stringify(parsed.crew_members),
          ]
        );
        synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${parsed.job_number}: ${message}`);
      }
    }

    return {
      ok: true,
      result: { total_events: events.length, synced, skipped, errors, unmatched_crew: unmatchedCrew },
    };
  } catch (error) {
    console.error('Calendar sync error:', error);
    return { ok: false, status: 500, error: 'Failed to fetch calendar events' };
  }
}
