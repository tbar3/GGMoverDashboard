'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '@/lib/db';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';

// Ported from gg-materials-management/lib/actions.ts (crew count-sheet flow).
// The inventory delta math is preserved exactly; only three things changed:
//   1. the materials app's `jobs` table is `materials_jobs` here,
//   2. its two bespoke auth models (ADMIN_EMAILS allowlist + crew passcode) are
//      replaced by the hub guards below,
//   3. routes point at /materials (crew) and /admin/materials (back office).

// ── Auth ─────────────────────────────────────────────────────
// Server actions are directly invocable, so every one guards itself — never
// trust that the page above it checked.

async function assertEmployee() {
  const emp = await getCurrentEmployee();
  if (!emp || !emp.is_active) throw new Error('Not authorized');
  return emp;
}

async function assertBackOffice() {
  const emp = await assertEmployee();
  if (!isBackOffice(emp)) throw new Error('Back office access required');
  return emp;
}

async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

type Area = 'crew' | 'admin';
const basePath = (area: Area) => (area === 'crew' ? '/materials' : '/admin/materials');

export type CountInput = {
  material_id: number;
  pre_dispatch: number | null;
  post_dispatch: number | null;
  post_job: number | null;
};

export type EquipInput = { equipment_id: number; count: number | null };

export type JobHeaderInput = {
  customer: string | null;
  job_number: string | null;
  crew_lead: string | null;
  crew: string | null;
  entered_in_smartmoving: boolean;
  is_storage_in: boolean;
  storage_pads_used: number | null;
  morning_routine: Record<string, boolean>;
  close_routine: Record<string, boolean>;
};

async function upsertEquipment(
  client: PoolClient,
  jobId: number,
  items: EquipInput[],
  column: 'dispatch_count' | 'after_count'
) {
  for (const it of items) {
    await client.query(
      `INSERT INTO job_equipment (job_id, equipment_id, ${column})
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, equipment_id) DO UPDATE SET ${column}=EXCLUDED.${column}`,
      [jobId, it.equipment_id, it.count]
    );
  }
}

async function upsertCounts(client: PoolClient, jobId: number, counts: CountInput[]) {
  for (const c of counts) {
    await client.query(
      `INSERT INTO job_counts (job_id, material_id, pre_dispatch, post_dispatch, post_job)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (job_id, material_id) DO UPDATE
         SET pre_dispatch=EXCLUDED.pre_dispatch,
             post_dispatch=EXCLUDED.post_dispatch,
             post_job=EXCLUDED.post_job`,
      [jobId, c.material_id, c.pre_dispatch, c.post_dispatch, c.post_job]
    );
  }
}

// Is this the FIRST job of the day for its truck? Only the first job loads from
// the warehouse (the truck is at the warehouse); later same-day jobs never
// touch warehouse stock and Par is not a factor.
async function isFirstJobOfDay(
  client: PoolClient,
  truckId: number,
  jobDate: string,
  sequenceNo: number
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT MIN(sequence_no) AS m FROM materials_jobs WHERE truck_id=$1 AND job_date=$2`,
    [truckId, jobDate]
  );
  return rows[0].m === null || sequenceNo === rows[0].m;
}

// For non-first jobs there is no loading step, so post_dispatch is forced to
// equal pre_dispatch. That makes loadDelta = 0 (warehouse untouched) and
// used = pre - post_job — guaranteed server-side, not just in the UI.
function normalizeCounts(firstOfDay: boolean, counts: CountInput[]): CountInput[] {
  if (firstOfDay) return counts;
  return counts.map((c) => ({ ...c, post_dispatch: c.pre_dispatch }));
}

// ── Create a new job ─────────────────────────────────────────
export async function createJob(
  truckId: number,
  date: string,
  isStorageIn = false,
  area: Area = 'crew'
) {
  await assertEmployee();

  if (!Number.isInteger(truckId) || truckId <= 0) {
    throw new Error('Please choose a truck before starting a job.');
  }
  const truckRows = await query(`SELECT id FROM trucks WHERE id=$1 AND active = TRUE`, [truckId]);
  if (!truckRows[0]) {
    throw new Error("That truck isn't available. Pick a truck from the list.");
  }

  const createdBy = await currentUserId();
  const base = basePath(area);

  // No duplicate sheets WITHIN A DAY: a truck may have only ONE unfinished job
  // for a date. If one exists, resume it. Across days this does not apply — a
  // stale open sheet from a prior day must not block today's.
  const openRows = await query<{ id: number }>(
    `SELECT id FROM materials_jobs WHERE truck_id=$1 AND job_date=$2 AND status <> 'complete'
      ORDER BY id DESC LIMIT 1`,
    [truckId, date]
  );
  if (openRows[0]) {
    revalidatePath(base);
    redirect(`${base}/jobs/${openRows[0].id}`);
  }

  let jobId: number;
  try {
    jobId = await withTransaction(async (client) => {
      const { rows: prevRows } = await client.query(
        `SELECT id, sequence_no FROM materials_jobs
          WHERE truck_id = $1 AND job_date = $2
          ORDER BY sequence_no DESC LIMIT 1`,
        [truckId, date]
      );
      const prev = prevRows[0]; // undefined => first job of the day
      const sequence_no = prev ? prev.sequence_no + 1 : 1;

      const { rows: jr } = await client.query(
        `INSERT INTO materials_jobs (job_date, truck_id, sequence_no, is_storage_in, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [date, truckId, sequence_no, isStorageIn, createdBy]
      );
      const id = jr[0].id as number;

      // 2nd+ job of the same day: pre-fill each Pre-Dispatch from the previous
      // job's Post-Job (the truck is continuous). First job is left blank so the
      // mover counts fresh and catches overnight discrepancies.
      if (prev) {
        await client.query(
          `INSERT INTO job_counts (job_id, material_id, pre_dispatch)
           SELECT $1, m.id, pc.post_job
             FROM materials m
             LEFT JOIN job_counts pc
               ON pc.job_id = $2 AND pc.material_id = m.id
            WHERE m.active = TRUE`,
          [id, prev.id]
        );
      }
      return id;
    });
  } catch (e: unknown) {
    // Race: a concurrent create for the same truck+date — resume that open job.
    if ((e as { code?: string })?.code === '23505') {
      const rows = await query<{ id: number }>(
        `SELECT id FROM materials_jobs WHERE truck_id=$1 AND job_date=$2 AND status <> 'complete'
          ORDER BY id DESC LIMIT 1`,
        [truckId, date]
      );
      if (rows[0]) {
        revalidatePath(base);
        redirect(`${base}/jobs/${rows[0].id}`);
      }
    }
    throw e;
  }

  revalidatePath(base);
  redirect(`${base}/jobs/${jobId}`);
}

// ── Step 1: Finished Dispatch — save the loading count, mark 'dispatched'.
// No inventory change yet (stock moves at completion).
export async function dispatchJob(
  jobId: number,
  header: JobHeaderInput,
  counts: CountInput[],
  equip: EquipInput[] = []
) {
  await assertEmployee();

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT truck_id, to_char(job_date,'YYYY-MM-DD') AS job_date, sequence_no, status
         FROM materials_jobs WHERE id=$1`,
      [jobId]
    );
    const job = rows[0];
    const firstOfDay = job
      ? await isFirstJobOfDay(client, job.truck_id, job.job_date, job.sequence_no)
      : true;
    await client.query(
      `UPDATE materials_jobs SET customer=$2, job_number=$3, crew_lead=$4, crew=$5,
              entered_in_smartmoving=$6, morning_routine=$7, close_routine=$8,
              is_storage_in=$9, storage_pads_used=$10, updated_at=NOW()
        WHERE id=$1`,
      [
        jobId,
        header.customer,
        header.job_number,
        header.crew_lead,
        header.crew,
        header.entered_in_smartmoving,
        JSON.stringify(header.morning_routine),
        JSON.stringify(header.close_routine),
        header.is_storage_in,
        header.is_storage_in ? header.storage_pads_used : null,
      ]
    );
    await upsertCounts(client, jobId, normalizeCounts(firstOfDay, counts));
    await upsertEquipment(client, jobId, equip, 'dispatch_count');
    if (job && job.status === 'draft') {
      await client.query(
        `UPDATE materials_jobs SET status='dispatched', updated_at=NOW() WHERE id=$1`,
        [jobId]
      );
    }
  });
  revalidatePath(`/materials/jobs/${jobId}`);
  revalidatePath('/admin/materials/history');
}

// ── Save Step-2 progress (no inventory effect) ───────────────
export async function saveJobDraft(
  jobId: number,
  header: JobHeaderInput,
  counts: CountInput[],
  equip: EquipInput[] = []
) {
  await assertEmployee();

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT truck_id, to_char(job_date,'YYYY-MM-DD') AS job_date, sequence_no
         FROM materials_jobs WHERE id=$1`,
      [jobId]
    );
    const job = rows[0];
    const firstOfDay = job
      ? await isFirstJobOfDay(client, job.truck_id, job.job_date, job.sequence_no)
      : true;

    await client.query(
      `UPDATE materials_jobs SET customer=$2, job_number=$3, crew_lead=$4, crew=$5,
              entered_in_smartmoving=$6, morning_routine=$7, close_routine=$8,
              is_storage_in=$9, storage_pads_used=$10, updated_at=NOW()
        WHERE id=$1`,
      [
        jobId,
        header.customer,
        header.job_number,
        header.crew_lead,
        header.crew,
        header.entered_in_smartmoving,
        JSON.stringify(header.morning_routine),
        JSON.stringify(header.close_routine),
        header.is_storage_in,
        header.is_storage_in ? header.storage_pads_used : null,
      ]
    );
    await upsertCounts(client, jobId, normalizeCounts(firstOfDay, counts));
    await upsertEquipment(client, jobId, equip, 'after_count');
  });
  revalidatePath(`/materials/jobs/${jobId}`);
}

type JobRef = {
  id: number;
  truck_id: number;
  warehouse_id: number; // the truck's home warehouse — loading pulls from here
  is_storage_in?: boolean;
  storage_pads_used?: number | null;
};

// Apply a job's inventory effect as DELTAS (reversible, order-independent):
//   warehouse -= loadDelta (post_dispatch - pre_dispatch)  [stock pulled onto truck]
//   truck     += (post_job - pre_dispatch)                 [net change on the truck]
// Total nets to -used. Ledger rows record load + use.
async function applyJobEffect(
  client: PoolClient,
  job: JobRef,
  counts: CountInput[],
  createdBy: string | null
) {
  for (const c of counts) {
    const pre = c.pre_dispatch ?? 0;
    const postD = c.post_dispatch ?? 0;
    const postJ = c.post_job ?? 0;
    const loadDelta = postD - pre;
    const truckDelta = postJ - pre;
    const used = postD - postJ;

    if (loadDelta !== 0) {
      await client.query(
        `UPDATE warehouse_stock SET on_hand = on_hand - $3, updated_at=NOW()
          WHERE warehouse_id=$1 AND material_id=$2`,
        [job.warehouse_id, c.material_id, loadDelta]
      );
      await client.query(
        `INSERT INTO inventory_transactions
           (material_id, truck_id, job_id, type, qty_delta, created_by)
         VALUES ($1, $2, $3, 'load', $4, $5)`,
        [c.material_id, job.truck_id, job.id, loadDelta, createdBy]
      );
    }
    if (truckDelta !== 0) {
      await client.query(
        `INSERT INTO truck_stock (truck_id, material_id, on_hand, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (truck_id, material_id)
           DO UPDATE SET on_hand = truck_stock.on_hand + $3, updated_at=NOW()`,
        [job.truck_id, c.material_id, truckDelta]
      );
    }
    if (used !== 0) {
      await client.query(
        `INSERT INTO inventory_transactions
           (material_id, truck_id, job_id, type, qty_delta, created_by)
         VALUES ($1, $2, $3, 'use', $4, $5)`,
        [c.material_id, job.truck_id, job.id, used, createdBy]
      );
    }
  }

  // Storage-In: furniture pads left in the customer's storage are deducted from
  // the Furniture Pads EQUIPMENT total-on-hand (count only; charged in SmartMoving).
  const pads = job.is_storage_in ? job.storage_pads_used ?? 0 : 0;
  if (pads > 0) {
    await client.query(
      `UPDATE equipment SET total_on_hand = total_on_hand - $1, updated_at=NOW()
        WHERE is_storage_pad = TRUE`,
      [pads]
    );
  }
}

// Undo a job's effect using its CURRENTLY-SAVED counts (negates applyJobEffect)
// and removes its load/use ledger rows. Call BEFORE overwriting counts on edit.
async function reverseJobEffect(client: PoolClient, jobId: number) {
  const { rows: jr } = await client.query(
    `SELECT j.id, j.truck_id, t.warehouse_id, j.is_storage_in, j.storage_pads_used
       FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id WHERE j.id=$1`,
    [jobId]
  );
  if (!jr[0]) return;
  const truckId = jr[0].truck_id;
  const warehouseId = jr[0].warehouse_id;
  const { rows: counts } = await client.query(
    `SELECT material_id, pre_dispatch, post_dispatch, post_job
       FROM job_counts WHERE job_id=$1`,
    [jobId]
  );
  for (const c of counts) {
    const pre = c.pre_dispatch ?? 0;
    const postD = c.post_dispatch ?? 0;
    const postJ = c.post_job ?? 0;
    const loadDelta = postD - pre;
    const truckDelta = postJ - pre;
    if (loadDelta !== 0) {
      await client.query(
        `UPDATE warehouse_stock SET on_hand = on_hand + $3, updated_at=NOW()
          WHERE warehouse_id=$1 AND material_id=$2`,
        [warehouseId, c.material_id, loadDelta]
      );
    }
    if (truckDelta !== 0) {
      await client.query(
        `UPDATE truck_stock SET on_hand = on_hand - $3, updated_at=NOW()
          WHERE truck_id=$1 AND material_id=$2`,
        [truckId, c.material_id, truckDelta]
      );
    }
  }
  const pads = jr[0].is_storage_in ? jr[0].storage_pads_used ?? 0 : 0;
  if (pads > 0) {
    await client.query(
      `UPDATE equipment SET total_on_hand = total_on_hand + $1, updated_at=NOW()
        WHERE is_storage_pad = TRUE`,
      [pads]
    );
  }

  await client.query(
    `DELETE FROM inventory_transactions WHERE job_id=$1 AND type IN ('load','use')`,
    [jobId]
  );
}

// ── Complete a job: persist counts AND apply inventory effects ──
// First completion: draft/dispatched -> complete (any employee). Re-saving an
// already-complete job is a back-office EDIT: reverse the old effect, re-apply.
export async function completeJob(
  jobId: number,
  header: JobHeaderInput,
  counts: CountInput[],
  equip: EquipInput[] = []
) {
  await assertEmployee();
  const createdBy = await currentUserId();

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT j.id, j.truck_id, t.warehouse_id, j.status, j.sequence_no,
              to_char(j.job_date,'YYYY-MM-DD') AS job_date
         FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id
        WHERE j.id=$1 FOR UPDATE`,
      [jobId]
    );
    const job = rows[0];
    if (!job) throw new Error('Job not found');

    const firstOfDay = await isFirstJobOfDay(
      client,
      job.truck_id,
      job.job_date,
      job.sequence_no
    );
    counts = normalizeCounts(firstOfDay, counts);

    const wasComplete = job.status === 'complete';
    if (wasComplete) {
      await assertBackOffice(); // only back office may edit a completed job
      await reverseJobEffect(client, jobId); // undo using the OLD saved counts
    }

    await client.query(
      `UPDATE materials_jobs SET customer=$2, job_number=$3, crew_lead=$4, crew=$5,
              entered_in_smartmoving=$6, morning_routine=$7, close_routine=$8,
              is_storage_in=$9, storage_pads_used=$10, updated_at=NOW()
        WHERE id=$1`,
      [
        jobId,
        header.customer,
        header.job_number,
        header.crew_lead,
        header.crew,
        header.entered_in_smartmoving,
        JSON.stringify(header.morning_routine),
        JSON.stringify(header.close_routine),
        header.is_storage_in,
        header.is_storage_in ? header.storage_pads_used : null,
      ]
    );
    await upsertCounts(client, jobId, counts);
    await upsertEquipment(client, jobId, equip, 'after_count');
    await applyJobEffect(
      client,
      {
        id: job.id,
        truck_id: job.truck_id,
        warehouse_id: job.warehouse_id,
        is_storage_in: header.is_storage_in,
        storage_pads_used: header.is_storage_in ? header.storage_pads_used : null,
      },
      counts,
      createdBy
    );

    if (!wasComplete) {
      await client.query(
        `UPDATE materials_jobs SET status='complete', updated_at=NOW() WHERE id=$1`,
        [jobId]
      );
    }
  });

  revalidatePath('/materials');
  revalidatePath(`/materials/jobs/${jobId}`);
  revalidatePath('/admin/materials');
}

export type ActionResult = { ok: boolean; message?: string };

// ── Move a job to a different truck (fixes a wrong-truck selection) ──
// Counts stay with the job; only the truck changes. For a completed job the
// inventory effect is moved from the old truck to the new one (back office only).
export async function reassignJobTruck(
  jobId: number,
  newTruckId: number
): Promise<ActionResult> {
  await assertEmployee();
  const createdBy = await currentUserId();
  let result: ActionResult = { ok: true };

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, truck_id, status, to_char(job_date,'YYYY-MM-DD') AS job_date
         FROM materials_jobs WHERE id=$1 FOR UPDATE`,
      [jobId]
    );
    const job = rows[0];
    if (!job) {
      result = { ok: false, message: 'Job not found.' };
      return;
    }
    if (job.truck_id === newTruckId) {
      result = { ok: false, message: 'That truck is already assigned.' };
      return;
    }

    const { rows: tr } = await client.query(
      `SELECT id, name, active, warehouse_id FROM trucks WHERE id=$1`,
      [newTruckId]
    );
    const target = tr[0];
    if (!target) {
      result = { ok: false, message: 'Truck not found.' };
      return;
    }

    const wasComplete = job.status === 'complete';
    if (wasComplete) {
      await assertBackOffice(); // editing a completed job's inventory is back office only
      if (target.warehouse_id == null) {
        result = {
          ok: false,
          message: `Give "${target.name}" a home warehouse in Admin before moving a completed job to it.`,
        };
        return;
      }
    } else {
      // One open job per truck PER DAY: don't move onto a truck that already
      // has another open sheet for this job's date.
      const { rows: open } = await client.query(
        `SELECT id FROM materials_jobs
          WHERE truck_id=$1 AND job_date=$2 AND status<>'complete' AND id<>$3
          LIMIT 1`,
        [newTruckId, job.job_date, jobId]
      );
      if (open[0]) {
        result = {
          ok: false,
          message: `${target.name} already has an open count sheet for ${job.job_date} — finish or delete it first.`,
        };
        return;
      }
    }

    if (wasComplete) {
      await reverseJobEffect(client, jobId); // undo on the OLD truck
    }

    // Append to the end of the target truck's jobs for that date so the
    // "Job #N" numbering and first-of-day logic stay consistent.
    const { rows: sr } = await client.query(
      `SELECT COALESCE(MAX(sequence_no),0)+1 AS next
         FROM materials_jobs WHERE truck_id=$1 AND job_date=$2 AND id<>$3`,
      [newTruckId, job.job_date, jobId]
    );
    await client.query(
      `UPDATE materials_jobs SET truck_id=$2, sequence_no=$3, updated_at=NOW() WHERE id=$1`,
      [jobId, newTruckId, sr[0].next]
    );

    if (wasComplete) {
      const { rows: counts } = await client.query(
        `SELECT material_id, pre_dispatch, post_dispatch, post_job
           FROM job_counts WHERE job_id=$1`,
        [jobId]
      );
      const { rows: jr } = await client.query(
        `SELECT is_storage_in, storage_pads_used FROM materials_jobs WHERE id=$1`,
        [jobId]
      );
      await applyJobEffect(
        client,
        {
          id: jobId,
          truck_id: newTruckId,
          warehouse_id: target.warehouse_id,
          is_storage_in: jr[0].is_storage_in,
          storage_pads_used: jr[0].storage_pads_used,
        },
        counts,
        createdBy
      );
    }
  });

  if (result.ok) {
    revalidatePath('/materials');
    revalidatePath(`/materials/jobs/${jobId}`);
    revalidatePath('/admin/materials');
  }
  return result;
}
