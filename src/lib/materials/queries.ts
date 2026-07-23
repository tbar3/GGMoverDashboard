import { query } from '@/lib/db';
import type {
  CrewMember,
  Job,
  JobCountRow,
  JobEquipmentRow,
  HistoryRow,
  RoutineItem,
  Truck,
} from './types';

// Ported from gg-materials-management/lib/queries.ts (crew-flow subset). The
// materials app's `jobs` table is `materials_jobs` here (the hub already has a
// `jobs` table). The hub's query() returns rows directly, so there is no
// `const { rows } = ...` unwrap.

export async function getTrucks(includeInactive = false): Promise<Truck[]> {
  const where = includeInactive ? '' : 'WHERE active = TRUE';
  return query<Truck>(
    `SELECT id, name, active, warehouse_id FROM trucks ${where} ORDER BY sort_order, name`
  );
}

export async function getCrewMembers(includeInactive = false): Promise<CrewMember[]> {
  const where = includeInactive ? '' : 'WHERE active = TRUE';
  return query<CrewMember>(
    `SELECT id, name, sort_order, active FROM crew_members ${where}
      ORDER BY sort_order, name`
  );
}

export async function getRoutineItems(): Promise<RoutineItem[]> {
  return query<RoutineItem>(
    `SELECT id, phase, label, sort_order, active
       FROM routine_items
      WHERE active = TRUE
      ORDER BY phase, sort_order, id`
  );
}

export async function getJobEquipment(jobId: number): Promise<JobEquipmentRow[]> {
  return query<JobEquipmentRow>(
    `SELECT e.id AS equipment_id, e.name, e.par, e.is_storage_pad,
            je.dispatch_count, je.after_count
       FROM equipment e
       LEFT JOIN job_equipment je
         ON je.equipment_id = e.id AND je.job_id = $1
      WHERE e.active = TRUE
      ORDER BY e.sort_order, e.name`,
    [jobId]
  );
}

export async function getJob(id: number): Promise<Job | null> {
  const rows = await query<Job>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date, j.truck_id,
            t.name AS truck_name, j.sequence_no, j.customer, j.job_number,
            j.crew_lead, j.crew, j.status, j.entered_in_smartmoving,
            j.is_storage_in, j.storage_pads_used, j.created_by,
            j.morning_routine, j.close_routine,
            EXTRACT(EPOCH FROM (now() - j.created_at)) / 3600 AS age_hours
       FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id
      WHERE j.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// Jobs created in the last 24h — the crew's recent view. Older jobs drop off
// the crew list but remain forever in the admin History.
export async function getCrewRecentJobs(): Promise<HistoryRow[]> {
  return query<HistoryRow>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date, j.truck_id,
            t.name AS truck_name, j.sequence_no, j.customer, j.job_number,
            j.crew_lead, j.crew, j.status, j.entered_in_smartmoving,
            j.morning_routine, j.close_routine,
            COUNT(c.*) FILTER (WHERE c.used IS NOT NULL) AS material_count,
            COALESCE(SUM(c.used), 0) AS total_used
       FROM materials_jobs j
       JOIN trucks t ON t.id = j.truck_id
       LEFT JOIN job_counts c ON c.job_id = j.id
      WHERE j.created_at >= now() - interval '24 hours'
      GROUP BY j.id, t.name
      ORDER BY j.created_at DESC`
  );
}

// One count row per active material (left-joined so every material shows).
export async function getJobCounts(jobId: number): Promise<JobCountRow[]> {
  return query<JobCountRow>(
    `SELECT m.id AS material_id, m.name, m.par, m.sort_order,
            c.pre_dispatch, c.post_dispatch, c.post_job, c.used, c.charged
       FROM materials m
       LEFT JOIN job_counts c
         ON c.material_id = m.id AND c.job_id = $1
      WHERE m.active = TRUE
      ORDER BY m.sort_order, m.name`,
    [jobId]
  );
}

// Jobs for a given truck + date (to compute sequence + list the day's jobs).
export async function getJobsForTruckDate(truckId: number, date: string): Promise<Job[]> {
  return query<Job>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date, j.truck_id,
            t.name AS truck_name, j.sequence_no, j.customer, j.job_number,
            j.crew_lead, j.crew, j.status, j.entered_in_smartmoving,
            j.morning_routine, j.close_routine
       FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id
      WHERE j.truck_id = $1 AND j.job_date = $2
      ORDER BY j.sequence_no`,
    [truckId, date]
  );
}
