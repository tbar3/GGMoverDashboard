'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import {
  COMPLIANCE_CATEGORIES,
  ENTITY_TYPES,
  ITEM_STATUSES,
} from './types';

/**
 * Compliance writes — back office only. Every action self-guards on its first
 * line: the /admin layout protects the pages, but a server action is its own
 * entry point and is invocable without ever loading one.
 */

type Result = { ok: boolean; error?: string };

const CATEGORY_SET = new Set<string>(COMPLIANCE_CATEGORIES.map((c) => c.value));
const ENTITY_SET = new Set<string>(ENTITY_TYPES.map((e) => e.value));
const STATUS_SET = new Set<string>(ITEM_STATUSES.map((s) => s.value));

/** Everything a compliance change can affect. */
function revalidate() {
  revalidatePath('/admin/compliance');
  revalidatePath('/admin/compliance/items');
  revalidatePath('/admin/compliance/fleet');
  // The nav badge is computed in the authenticated layout, so every back-office
  // page shows a stale count until its layout re-renders.
  revalidatePath('/admin', 'layout');
}

export interface ItemInput {
  id?: string;
  name: string;
  category: string;
  entityType: string;
  vehicleId?: string | null;
  entityEmployeeId?: string | null;
  issuingAuthority?: string | null;
  identifier?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  cadenceMonths?: number | null;
  leadTimeDays: number;
  cost?: number | null;
  ownerEmployeeId?: string | null;
  status: string;
  externalUrl?: string | null;
  notes?: string | null;
}

/** Trim to null, so an emptied text input clears the column instead of storing ''. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function saveItem(input: ItemInput): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give it a name' };
  if (!CATEGORY_SET.has(input.category)) return { ok: false, error: 'Unknown category' };
  if (!ENTITY_SET.has(input.entityType)) return { ok: false, error: 'Unknown entity type' };
  if (!STATUS_SET.has(input.status)) return { ok: false, error: 'Unknown status' };

  // Mirror the entity CHECK constraint here so the user gets a sentence rather
  // than a Postgres constraint violation.
  const vehicleId = input.entityType === 'vehicle' ? clean(input.vehicleId) : null;
  const entityEmployeeId = input.entityType === 'employee' ? clean(input.entityEmployeeId) : null;
  if (input.entityType === 'vehicle' && !vehicleId) {
    return { ok: false, error: 'Pick which vehicle this applies to' };
  }
  if (input.entityType === 'employee' && !entityEmployeeId) {
    return { ok: false, error: 'Pick which employee this applies to' };
  }

  if (input.leadTimeDays < 0 || !Number.isFinite(input.leadTimeDays)) {
    return { ok: false, error: 'Warning window must be zero or more days' };
  }
  if (input.cadenceMonths != null && input.cadenceMonths <= 0) {
    return { ok: false, error: 'Renewal cadence must be a positive number of months' };
  }
  if (input.issueDate && input.expirationDate && input.expirationDate < input.issueDate) {
    return { ok: false, error: 'Expiration cannot be before the issue date' };
  }

  const params = [
    name,
    input.category,
    input.entityType,
    vehicleId,
    entityEmployeeId,
    clean(input.issuingAuthority),
    clean(input.identifier),
    clean(input.issueDate),
    clean(input.expirationDate),
    input.cadenceMonths ?? null,
    input.leadTimeDays,
    input.cost ?? null,
    clean(input.ownerEmployeeId),
    input.status,
    clean(input.externalUrl),
    clean(input.notes),
  ];

  if (input.id) {
    // Editing is a human confirming the details, which clears the "seeded from
    // general knowledge, still needs checking" flag.
    await query(
      `UPDATE compliance_items
          SET name = $2, category = $3, entity_type = $4, vehicle_id = $5,
              entity_employee_id = $6, issuing_authority = $7, identifier = $8,
              issue_date = $9, expiration_date = $10, cadence_months = $11,
              lead_time_days = $12, cost = $13, owner_employee_id = $14,
              status = $15, external_url = $16, notes = $17,
              needs_review = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [input.id, ...params]
    );
  } else {
    await query(
      `INSERT INTO compliance_items
         (name, category, entity_type, vehicle_id, entity_employee_id,
          issuing_authority, identifier, issue_date, expiration_date, cadence_months,
          lead_time_days, cost, owner_employee_id, status, external_url, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [...params, guard.employee.id]
    );
  }
  revalidate();
  return { ok: true };
}

export async function setItemStatus(id: string, status: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!STATUS_SET.has(status)) return { ok: false, error: 'Unknown status' };

  await query(
    'UPDATE compliance_items SET status = $2, updated_at = NOW() WHERE id = $1',
    [id, status]
  );
  revalidate();
  return { ok: true };
}

export async function setItemOwner(id: string, ownerId: string | null): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  await query(
    'UPDATE compliance_items SET owner_employee_id = $2, updated_at = NOW() WHERE id = $1',
    [id, ownerId || null]
  );
  revalidate();
  return { ok: true };
}

/**
 * Hard delete.
 *
 * Archiving is the usual way to retire an obligation — it keeps the renewal
 * history readable, which is the whole point of having kept it. Deleting takes
 * the history and the attachment rows with it, so it is a separate, deliberate
 * action.
 *
 * Blob objects are NOT removed by the cascade — they are storage, not rows — so
 * the files are collected first and deleted after the DB commits. See
 * attachment-actions.ts for why that order.
 */
export async function deleteItem(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const { deleteOrphanedBlobs, collectItemDocumentIds } = await import('./attachment-actions');
  const documentIds = await collectItemDocumentIds(id);

  await query('DELETE FROM compliance_items WHERE id = $1', [id]);
  await deleteOrphanedBlobs(documentIds);

  revalidate();
  return { ok: true };
}

export interface RenewalInput {
  itemId: string;
  issueDate?: string | null;
  expirationDate?: string | null;
  completedOn: string;
  cost?: number | null;
  confirmationNumber?: string | null;
  notes?: string | null;
}

/**
 * Record a completed renewal.
 *
 * The renewal row and the item's mirrored dates are written in ONE transaction,
 * and this is the ONLY code path allowed to touch either. The mirror is what lets
 * the dashboard stay a single-table scan; if anything else inserts a renewal, the
 * dashboard silently goes stale and nobody finds out until something lapses.
 */
export async function recordRenewal(input: RenewalInput): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const item = await queryOne<{ id: string }>(
    'SELECT id FROM compliance_items WHERE id = $1',
    [input.itemId]
  );
  if (!item) return { ok: false, error: 'That item no longer exists' };

  if (input.issueDate && input.expirationDate && input.expirationDate < input.issueDate) {
    return { ok: false, error: 'Expiration cannot be before the issue date' };
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO compliance_renewals
         (item_id, issue_date, expiration_date, completed_on, cost,
          confirmation_number, notes, completed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.itemId,
        clean(input.issueDate),
        clean(input.expirationDate),
        input.completedOn,
        input.cost ?? null,
        clean(input.confirmationNumber),
        clean(input.notes),
        guard.employee.id,
      ]
    );
    // COALESCE so a renewal recorded without dates does not blank the item's.
    await client.query(
      `UPDATE compliance_items
          SET issue_date      = COALESCE($2, issue_date),
              expiration_date = COALESCE($3, expiration_date),
              cost            = COALESCE($4, cost),
              needs_review    = FALSE,
              updated_at      = NOW()
        WHERE id = $1`,
      [input.itemId, clean(input.issueDate), clean(input.expirationDate), input.cost ?? null]
    );
  });

  revalidatePath(`/admin/compliance/items/${input.itemId}`);
  revalidate();
  return { ok: true };
}

export async function deleteRenewal(id: string, itemId: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  // Deliberately does NOT roll the item's dates back to the previous renewal.
  // Deleting a renewal means it was entered wrong, not that the filing was
  // undone — and guessing which is which would silently change an expiration
  // date nobody asked to change. Edit the item's dates directly if they are off.
  await query('DELETE FROM compliance_renewals WHERE id = $1', [id]);
  revalidatePath(`/admin/compliance/items/${itemId}`);
  revalidate();
  return { ok: true };
}
