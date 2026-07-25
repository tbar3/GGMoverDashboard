import { query, queryOne } from '@/lib/db';

// Back-office dashboard metrics. Most read from smartmoving_jobs (the imported
// weekly report — real data); materials/attendance/damages read from tables that
// are empty until materials cutover / more data lands, so callers show clean
// empty states.

const REAL_JOB = "opportunity_status NOT IN ('Lost', 'Bad lead', 'Cancelled')";

// Today's jobs come from the calendar-synced `jobs` table (the live source, as
// fresh as the last SmartMoving-calendar sync) — not the trailing report.
export interface TodayJob {
  job_number: string | null;
  customer_name: string | null;
  service_type: string | null;
  start_time: string | null;
  quoted_trucks: number | null;
  quoted_crew: number | null;
  truck_name: string | null;
  crew_names: string[] | null;
}

export interface TruckDay {
  job_date: string;
  trucks: number;
  jobs: number;
}

export interface DeclineAlert {
  jobId: string;
  customer: string;
  jobDate: string;
  employeeName: string;
  reason: string | null;
  respondedAt: string;
}

/** Crew declines on upcoming jobs — surfaced to admin so they can re-staff. */
export async function getRecentDeclines(): Promise<DeclineAlert[]> {
  return query<DeclineAlert>(
    `SELECT j.id AS "jobId", j.customer_name AS customer, j.date::text AS "jobDate",
            e.name AS "employeeName", r.decline_reason AS reason,
            r.responded_at::text AS "respondedAt"
       FROM job_responses r
       JOIN jobs j ON j.id = r.job_id
       JOIN employees e ON e.id = r.employee_id
      WHERE r.response = 'declined' AND j.date >= CURRENT_DATE
      ORDER BY r.responded_at DESC
      LIMIT 25`
  );
}

export interface TerminationFlag {
  employeeId: string;
  employeeName: string;
  writeUpsThisMonth: number;
  monthLabel: string;
}

/**
 * Policy: 3 write-ups in a calendar month flags a crew member for termination
 * review. Computed live from write_ups so it clears itself when the month rolls
 * over (or a write-up is removed). Active employees only.
 */
export async function getTerminationFlags(threshold = 3): Promise<TerminationFlag[]> {
  return query<TerminationFlag>(
    `SELECT e.id AS "employeeId", e.name AS "employeeName",
            COUNT(w.id)::int AS "writeUpsThisMonth",
            to_char(date_trunc('month', CURRENT_DATE), 'Mon YYYY') AS "monthLabel"
       FROM write_ups w
       JOIN employees e ON e.id = w.employee_id
      WHERE e.is_active = TRUE
        AND w.event_date >= date_trunc('month', CURRENT_DATE)
        AND w.event_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      GROUP BY e.id, e.name
     HAVING COUNT(w.id) >= $1
      ORDER BY COUNT(w.id) DESC, e.name`,
    [threshold]
  );
}

/** Write-up count for one employee in the current calendar month (for their record). */
export async function getWriteUpMonthCount(employeeId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM write_ups
      WHERE employee_id = $1
        AND event_date >= date_trunc('month', CURRENT_DATE)
        AND event_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [employeeId]
  );
  return row?.n ?? 0;
}

export interface AdminDashboard {
  dataAsOf: string | null; // most recent smartmoving_jobs import
  kpis: {
    jobsThisMonth: number;
    revenueMtd: number;
    materialsCostMtd: number;
    laborCostMtd: number;
    bookedPipeline: number;
    bookedCount: number;
  };
  todaysJobs: TodayJob[];
  truckDemand: TruckDay[];
  ownedTrucks: number;
  alerts: {
    tardiesToday: number;
    unclosedCountSheets: number;
    lowInventory: number;
    jobsNotInSmartMoving: number;
    damagesThisWeek: number;
    rentalDays: TruckDay[]; // upcoming days needing more trucks than owned
  };
  people: {
    activeHeadcount: number;
    inTrial: number;
    candidatesActive: number;
    attendanceRatePct: number | null;
  };
  materials: {
    usageThisMonth: number;
    topUsed: { name: string; used: number }[];
  };
}

export async function getAdminDashboard(
  monthStart: string,
  monthEnd: string,
  today: string,
  weekEnd: string,
  weekStart: string,
  trialCutoff: string
): Promise<AdminDashboard> {
  const [
    kpiRow,
    pipelineRow,
    todaysJobs,
    truckDemand,
    ownedRow,
    tardyRow,
    unclosedRow,
    lowInvRow,
    notEnteredRow,
    damagesRow,
    headcountRow,
    trialRow,
    candidatesRow,
    attendanceRows,
    usageRow,
    topUsed,
    importedRow,
  ] = await Promise.all([
    queryOne<{ jobs: number; rev: number; mat: number; labor: number }>(
      `SELECT COUNT(*) AS jobs,
              COALESCE(SUM(total_actual_cost), 0)::float8 AS rev,
              COALESCE(SUM(actual_materials_cost), 0)::float8 AS mat,
              COALESCE(SUM(actual_labor_cost), 0)::float8 AS labor
         FROM smartmoving_jobs
        WHERE job_date >= $1 AND job_date <= $2 AND ${REAL_JOB}`,
      [monthStart, monthEnd]
    ),
    queryOne<{ pipeline: number; c: number }>(
      `SELECT COALESCE(SUM(total_estimated_cost), 0)::float8 AS pipeline, COUNT(*) AS c
         FROM smartmoving_jobs
        WHERE opportunity_status = 'Booked' AND job_date >= $1`,
      [today]
    ),
    query<TodayJob>(
      // Live source: the calendar-synced jobs table. crew_ids are matched to
      // employees, so we resolve their names.
      `SELECT j.job_number, j.customer_name, j.service_type, j.start_time,
              j.quoted_trucks, j.quoted_crew, j.truck_name,
              (SELECT array_agg(e.name) FROM employees e WHERE e.id = ANY(j.crew_ids)) AS crew_names
         FROM jobs j
        WHERE j.date = $1
        ORDER BY j.start_time NULLS LAST`,
      [today]
    ),
    query<TruckDay>(
      `SELECT to_char(job_date, 'YYYY-MM-DD') AS job_date,
              COALESCE(SUM(est_trucks), 0)::float8 AS trucks, COUNT(*)::int AS jobs
         FROM smartmoving_jobs
        WHERE opportunity_status = 'Booked' AND job_date >= $1 AND job_date <= $2
        GROUP BY job_date ORDER BY job_date`,
      [today, weekEnd]
    ),
    queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM trucks WHERE active = TRUE'),
    queryOne<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM attendance WHERE date = $1 AND is_tardy = TRUE',
      [today]
    ),
    queryOne<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM materials_jobs WHERE status <> 'complete' AND job_date < $1",
      [today]
    ),
    queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT ws.material_id)::int AS c
         FROM warehouse_stock ws
        WHERE ws.low_level > 0 AND ws.on_hand <= ws.low_level`
    ),
    queryOne<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM materials_jobs WHERE status = 'complete' AND entered_in_smartmoving = FALSE"
    ),
    queryOne<{ c: number; impact: number }>(
      `SELECT COUNT(*)::int AS c,
              COALESCE(SUM(CASE WHEN was_reported THEN amount ELSE amount * 2 END), 0)::float8 AS impact
         FROM damages WHERE created_at >= $1`,
      [weekStart]
    ),
    queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM employees WHERE is_active = TRUE'),
    queryOne<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM employees WHERE is_active = TRUE AND start_date >= $1',
      [trialCutoff]
    ),
    queryOne<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM candidates WHERE status IN ('interviewed', 'advance', 'maybe')"
    ),
    query<{ is_tardy: boolean }>(
      'SELECT is_tardy FROM attendance WHERE date >= $1 AND date <= $2',
      [monthStart, monthEnd]
    ),
    queryOne<{ used: number }>(
      `SELECT COALESCE(SUM(qty_delta), 0)::float8 AS used
         FROM inventory_transactions WHERE type = 'use' AND created_at >= $1`,
      [monthStart]
    ),
    query<{ name: string; used: number }>(
      `SELECT m.name, COALESCE(SUM(t.qty_delta), 0)::float8 AS used
         FROM inventory_transactions t
         JOIN materials m ON m.id = t.material_id
        WHERE t.type = 'use' AND t.created_at >= $1
        GROUP BY m.name ORDER BY used DESC LIMIT 5`,
      [monthStart]
    ),
    queryOne<{ imported_at: string }>(
      'SELECT to_char(MAX(imported_at), \'Mon D, YYYY\') AS imported_at FROM smartmoving_jobs'
    ),
  ]);

  const ownedTrucks = ownedRow?.c ?? 0;
  const rentalDays =
    ownedTrucks > 0 ? truckDemand.filter((d) => d.trucks > ownedTrucks) : [];

  const attendanceTotal = attendanceRows.length;
  const attendanceTardy = attendanceRows.filter((a) => a.is_tardy).length;
  const attendanceRatePct =
    attendanceTotal > 0
      ? Math.round(((attendanceTotal - attendanceTardy) / attendanceTotal) * 100)
      : null;

  return {
    dataAsOf: importedRow?.imported_at ?? null,
    kpis: {
      jobsThisMonth: Number(kpiRow?.jobs ?? 0),
      revenueMtd: kpiRow?.rev ?? 0,
      materialsCostMtd: kpiRow?.mat ?? 0,
      laborCostMtd: kpiRow?.labor ?? 0,
      bookedPipeline: pipelineRow?.pipeline ?? 0,
      bookedCount: Number(pipelineRow?.c ?? 0),
    },
    todaysJobs,
    truckDemand,
    ownedTrucks,
    alerts: {
      tardiesToday: tardyRow?.c ?? 0,
      unclosedCountSheets: unclosedRow?.c ?? 0,
      lowInventory: lowInvRow?.c ?? 0,
      jobsNotInSmartMoving: notEnteredRow?.c ?? 0,
      damagesThisWeek: damagesRow?.c ?? 0,
      rentalDays,
    },
    people: {
      activeHeadcount: headcountRow?.c ?? 0,
      inTrial: trialRow?.c ?? 0,
      candidatesActive: candidatesRow?.c ?? 0,
      attendanceRatePct,
    },
    materials: {
      usageThisMonth: usageRow?.used ?? 0,
      topUsed,
    },
  };
}
