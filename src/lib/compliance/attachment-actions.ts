'use server';

import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { validateUpload } from '@/lib/upload-limits';

/**
 * Files attached to compliance records.
 *
 * The file itself still lives in `documents` + Vercel Blob and is still served
 * ONLY by /api/documents/[id]/download, which re-checks the caller and the
 * document's audience. Nothing here adds a second way to read a file.
 *
 * Every compliance upload is written with audience='back_office' and
 * source='compliance'. Both are hardcoded, never taken from the form:
 *   * audience is the download route's only gate — a certificate uploaded as
 *     'crew' would be readable by every helper with a login.
 *   * source keeps insurance certs out of the crew handbook library.
 */

type Result = { ok: boolean; error?: string };

/** Which parent a file hangs off. Exactly one, enforced by a CHECK in the DB. */
const PARENT_COLUMNS = {
  item: 'item_id',
  renewal: 'renewal_id',
  service_log: 'service_log_id',
  vehicle: 'vehicle_id',
} as const;

type ParentKind = keyof typeof PARENT_COLUMNS;

function revalidate() {
  revalidatePath('/admin/compliance', 'layout');
  revalidatePath('/admin/documents');
}

export async function uploadAttachment(formData: FormData): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error: 'Document storage is not connected yet — BLOB_READ_WRITE_TOKEN is missing.',
    };
  }

  const parentKind = String(formData.get('parentKind') ?? '') as ParentKind;
  const parentId = String(formData.get('parentId') ?? '').trim();
  const column = PARENT_COLUMNS[parentKind];
  if (!column || !parentId) return { ok: false, error: 'Nothing to attach this to' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Pick a file' };
  const invalid = validateUpload(file);
  if (invalid) return { ok: false, error: invalid };

  const title = String(formData.get('title') ?? '').trim() || file.name;

  // addRandomSuffix keeps two uploads of "registration.pdf" from overwriting one
  // another — the pathname is storage, not an identifier anyone types.
  const blob = await put(`documents/compliance/${file.name}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  try {
    const doc = await queryOne<{ id: string }>(
      `INSERT INTO documents
         (title, category, audience, source, blob_url, blob_pathname,
          original_filename, content_type, size_bytes, uploaded_by, uploaded_by_name)
       VALUES ($1, 'operations', 'back_office', 'compliance', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        title,
        blob.url,
        blob.pathname,
        file.name,
        file.type || null,
        file.size,
        guard.employee.id,
        guard.employee.name,
      ]
    );
    if (!doc) throw new Error('document insert returned no row');

    await query(
      `INSERT INTO compliance_attachments (document_id, ${column}, created_by)
       VALUES ($1, $2, $3)`,
      [doc.id, parentId, guard.employee.id]
    );
  } catch (err) {
    // The blob landed but the rows did not. Without this the file sits in storage
    // forever with nothing pointing at it and no way to find it again.
    await del(blob.url).catch(() => {});
    throw err;
  }

  revalidate();
  return { ok: true };
}

/** Removes the attachment, its document row, and the stored file. */
export async function deleteAttachment(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const row = await queryOne<{ document_id: string; blob_url: string }>(
    `SELECT a.document_id, d.blob_url
       FROM compliance_attachments a
       JOIN documents d ON d.id = a.document_id
      WHERE a.id = $1`,
    [id]
  );
  if (!row) return { ok: false, error: 'That file is already gone' };

  // Deleting the document cascades the attachment row away with it.
  await query('DELETE FROM documents WHERE id = $1', [row.document_id]);
  // Rows first, blob second: a stray blob is cheap, a row pointing at a deleted
  // file shows someone a download that 404s.
  await del(row.blob_url).catch(() => {});

  revalidate();
  return { ok: true };
}

/**
 * Every document id reachable from an item — its own attachments and those of
 * all its renewals.
 *
 * Called BEFORE deleting the item, because the FK cascade takes the attachment
 * rows with it and there would be nothing left to look the blobs up from.
 */
export async function collectItemDocumentIds(itemId: string): Promise<string[]> {
  const rows = await query<{ document_id: string }>(
    `SELECT a.document_id
       FROM compliance_attachments a
       LEFT JOIN compliance_renewals r ON r.id = a.renewal_id
      WHERE a.item_id = $1 OR r.item_id = $1`,
    [itemId]
  );
  return rows.map((r) => r.document_id);
}

/**
 * Delete document rows and their blobs, for files whose parent record has already
 * been removed.
 *
 * Cascades clean up rows; nothing cleans up storage. Called after the parent
 * delete commits — if it ran before, a failed delete would leave rows pointing at
 * files that no longer exist, which is the worse of the two failures.
 */
export async function deleteOrphanedBlobs(documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;

  const docs = await query<{ blob_url: string }>(
    'SELECT blob_url FROM documents WHERE id = ANY($1::uuid[])',
    [documentIds]
  );
  await query('DELETE FROM documents WHERE id = ANY($1::uuid[])', [documentIds]);
  await Promise.all(docs.map((d) => del(d.blob_url).catch(() => {})));
}
