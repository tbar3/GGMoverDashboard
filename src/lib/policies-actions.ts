'use server';

import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import { query, queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { POLICY_CATEGORIES, POLICY_STATUSES } from '@/lib/policies-shared';

// Policy + document writes — back office only. Every action self-guards; the
// /admin layout protects the pages, but a server action is its own entry point.

type Result = { ok: boolean; error?: string };

const CATEGORY_SET = new Set<string>(POLICY_CATEGORIES.map((c) => c.value));
const STATUS_SET = new Set<string>(POLICY_STATUSES.map((s) => s.value));
const AUDIENCE_SET = new Set(['crew', 'back_office']);

/** Everything a policy change can affect. */
function revalidate() {
  revalidatePath('/admin/policies');
  revalidatePath('/admin/documents');
  revalidatePath('/policies');
  revalidatePath('/admin/morning-meeting');
}

// ── Policies ─────────────────────────────────────────────────────────────────

export async function savePolicy(input: {
  id?: string;
  title: string;
  titleEs?: string;
  bodyEn: string;
  bodyEs?: string;
  category: string;
  status: string;
  inRotation: boolean;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!CATEGORY_SET.has(input.category)) return { ok: false, error: 'Unknown category' };
  if (!STATUS_SET.has(input.status)) return { ok: false, error: 'Unknown status' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give it a title' };
  // English is required to publish; Spanish is optional and crew fall back to it.
  if (input.status === 'published' && !input.bodyEn.trim()) {
    return { ok: false, error: 'Write the English text before publishing' };
  }

  const params = [
    title,
    input.titleEs?.trim() || null,
    input.bodyEn.trim(),
    input.bodyEs?.trim() || null,
    input.category,
    input.status,
    input.inRotation,
  ];

  if (input.id) {
    // Editing is a human confirming the wording, which clears the "drafted by
    // inference, needs a look" flag on the seeded policies.
    await query(
      `UPDATE policies
          SET title = $2, title_es = $3, body_en = $4, body_es = $5,
              category = $6, status = $7, in_rotation = $8,
              needs_review = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [input.id, ...params]
    );
  } else {
    await query(
      `INSERT INTO policies (title, title_es, body_en, body_es, category, status, in_rotation, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [...params, guard.employee.id]
    );
  }
  revalidate();
  return { ok: true };
}

export async function setPolicyStatus(id: string, status: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!STATUS_SET.has(status)) return { ok: false, error: 'Unknown status' };

  if (status === 'published') {
    const policy = await queryOne<{ body_en: string }>(
      'SELECT body_en FROM policies WHERE id = $1',
      [id]
    );
    if (!policy?.body_en.trim()) {
      return { ok: false, error: 'Write the English text before publishing' };
    }
  }
  await query('UPDATE policies SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
  revalidate();
  return { ok: true };
}

export async function setPolicyRotation(id: string, inRotation: boolean): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('UPDATE policies SET in_rotation = $2, updated_at = NOW() WHERE id = $1', [
    id,
    inRotation,
  ]);
  revalidate();
  return { ok: true };
}

/**
 * Hard delete. Archiving is the usual way to retire a policy — it keeps the
 * Morning Meeting history of the days it was covered readable. Deleting blanks
 * those history rows, so it is a separate, deliberate action.
 */
export async function deletePolicy(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM policies WHERE id = $1', [id]);
  revalidate();
  return { ok: true };
}

// ── Documents ────────────────────────────────────────────────────────────────

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

/**
 * Upload a document to Vercel Blob and record it.
 *
 * `access: 'private'` is deliberate: the blob URL is never handed to a browser.
 * Crew reach a file through /api/documents/[id]/download, which re-checks who
 * they are and what the document's audience is. A public URL would be a
 * permanent unauthenticated link to whatever it points at.
 */
export async function uploadDocument(formData: FormData): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error: 'Document storage is not connected yet — BLOB_READ_WRITE_TOKEN is missing.',
    };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Pick a file' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That file is larger than 25 MB' };
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: `${file.type} isn't an allowed file type` };
  }

  const title = String(formData.get('title') ?? '').trim() || file.name;
  const description = String(formData.get('description') ?? '').trim() || null;
  const category = String(formData.get('category') ?? 'general');
  const audience = String(formData.get('audience') ?? 'crew');
  const isHandbook = formData.get('isHandbook') === 'true';
  if (!CATEGORY_SET.has(category)) return { ok: false, error: 'Unknown category' };
  if (!AUDIENCE_SET.has(audience)) return { ok: false, error: 'Unknown audience' };

  // addRandomSuffix keeps two uploads of "handbook.pdf" from overwriting one
  // another — the pathname is storage, not an identifier anyone types.
  const blob = await put(`documents/${file.name}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  try {
    await query(
      `INSERT INTO documents
         (title, description, category, audience, blob_url, blob_pathname,
          original_filename, content_type, size_bytes, is_handbook, uploaded_by, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        title,
        description,
        category,
        audience,
        blob.url,
        blob.pathname,
        file.name,
        file.type || null,
        file.size,
        isHandbook,
        guard.employee.id,
        guard.employee.name,
      ]
    );
  } catch (err) {
    // The blob landed but the row did not. Without this the file would sit in
    // storage forever with nothing pointing at it and no way to find it.
    await del(blob.url).catch(() => {});
    throw err;
  }

  revalidate();
  return { ok: true };
}

export async function updateDocument(input: {
  id: string;
  title: string;
  description?: string;
  category: string;
  audience: string;
  isHandbook: boolean;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!CATEGORY_SET.has(input.category)) return { ok: false, error: 'Unknown category' };
  if (!AUDIENCE_SET.has(input.audience)) return { ok: false, error: 'Unknown audience' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give it a title' };

  await query(
    `UPDATE documents
        SET title = $2, description = $3, category = $4, audience = $5,
            is_handbook = $6, updated_at = NOW()
      WHERE id = $1`,
    [input.id, title, input.description?.trim() || null, input.category, input.audience, input.isHandbook]
  );
  revalidate();
  return { ok: true };
}

/** Removes the row AND the stored file — a document with no file is just a lie. */
export async function deleteDocument(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };

  const doc = await queryOne<{ blob_url: string }>(
    'SELECT blob_url FROM documents WHERE id = $1',
    [id]
  );
  if (!doc) return { ok: false, error: 'That document is already gone' };

  await query('DELETE FROM documents WHERE id = $1', [id]);
  // Row first, blob second: a stray blob is cheap, a row pointing at a deleted
  // file shows crew a download that 404s.
  await del(doc.blob_url).catch(() => {});
  revalidate();
  return { ok: true };
}
