/**
 * Policies — the handbook as editable rows, and the documents library.
 *
 * Two audiences, one source of truth:
 *   * Back office authors at /admin/policies and /admin/documents.
 *   * Crew read published policies and crew-audience documents at /policies.
 *
 * Policies also feed Morning Meeting's Policy of the Day (see morning-meeting.ts),
 * which is why there is no separate reminder list any more.
 */

import { query, queryOne } from '@/lib/db';
import type { Policy, DocumentRow } from '@/lib/policies-shared';

export * from '@/lib/policies-shared';

const POLICY_COLUMNS = `
  id, title, title_es, body_en, body_es, category, status,
  in_rotation, needs_review, sort_order, created_at, updated_at`;

/** Everything, any status — the admin list. */
export async function getAllPolicies(): Promise<Policy[]> {
  return query<Policy>(
    `SELECT ${POLICY_COLUMNS} FROM policies
      ORDER BY (status = 'archived'), category, sort_order, title`
  );
}

/** What crew are allowed to read. */
export async function getPublishedPolicies(): Promise<Policy[]> {
  return query<Policy>(
    `SELECT ${POLICY_COLUMNS} FROM policies
      WHERE status = 'published'
      ORDER BY category, sort_order, title`
  );
}

export async function getPolicy(id: string): Promise<Policy | null> {
  return queryOne<Policy>(`SELECT ${POLICY_COLUMNS} FROM policies WHERE id = $1`, [id]);
}

const DOCUMENT_COLUMNS = `
  id, title, description, category, audience, original_filename,
  content_type, size_bytes, is_handbook, uploaded_by_name, created_at`;

/**
 * Documents for a viewer. Back office see everything; crew see only the rows
 * marked for them. The audience filter lives HERE rather than in each caller so
 * a new page cannot forget it and leak a back-office document.
 */
export async function getDocuments(isBackOffice: boolean): Promise<DocumentRow[]> {
  return query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents
      WHERE ($1::boolean OR audience = 'crew')
      ORDER BY is_handbook DESC, category, title`,
    [isBackOffice]
  );
}

/** The blob pointer for a download. Never sent to the browser. */
export async function getDocumentForDownload(
  id: string
): Promise<{ blob_url: string; original_filename: string; content_type: string | null; audience: string } | null> {
  return queryOne(
    'SELECT blob_url, original_filename, content_type, audience FROM documents WHERE id = $1',
    [id]
  );
}
